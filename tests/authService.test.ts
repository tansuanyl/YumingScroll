import { describe, expect, it } from "vitest";
import {
  AuthService,
  GENERATION_COIN_COSTS,
  createSessionToken,
  hashPassword,
  hashSessionToken,
  resolveBootstrapPassword,
  verifyPassword
} from "../server/services/AuthService";
import type { EmailVerificationDelivery } from "../server/services/EmailService";

describe("auth service helpers", () => {
  it("hashes and verifies passwords without storing the plain value", async () => {
    const hash = await hashPassword("correct-horse-battery-staple");

    expect(hash).not.toContain("correct-horse-battery-staple");
    await expect(verifyPassword("correct-horse-battery-staple", hash)).resolves.toBe(true);
    await expect(verifyPassword("wrong-password", hash)).resolves.toBe(false);
  });

  it("creates opaque session tokens and stable token hashes", () => {
    const token = createSessionToken();

    expect(token.length).toBeGreaterThanOrEqual(40);
    expect(hashSessionToken(token)).toBe(hashSessionToken(token));
    expect(hashSessionToken(token)).not.toBe(token);
  });

  it("prefers base64 bootstrap passwords so deployment secrets can contain dotenv syntax characters", () => {
    const secret = "admin&#pass";

    expect(
      resolveBootstrapPassword({
        password: "fallback-password",
        passwordBase64: Buffer.from(secret, "utf8").toString("base64"),
        basicPassword: "basic-password"
      })
    ).toBe(secret);
  });

  it("keeps admin-created internal accounts free while registered users spend coins", async () => {
    const auth = new AuthService({ prisma: null, emailDelivery: createTestEmailDelivery() });
    const internalUser = await auth.createUser({ username: "internal-test", password: "password123" });
    const registeredUser = await auth.registerUser({ email: "paid-user@example.com", password: "password123" });

    expect(internalUser.billingMode).toBe("free");
    expect(registeredUser.billingMode).toBe("coins");
    expect(registeredUser.coinBalance).toBe(10);

    const starterCharge = await auth.chargeForAction({
      userId: registeredUser.id,
      action: "text.generateStory",
      cost: GENERATION_COIN_COSTS.text
    });
    expect(starterCharge.charged).toBe(true);
    await expect(auth.getBillingStatus(registeredUser.id)).resolves.toMatchObject({ coinBalance: 0 });

    await expect(
      auth.chargeForAction({
        userId: registeredUser.id,
        action: "text.generateStory",
        cost: GENERATION_COIN_COSTS.text
      })
    ).rejects.toThrow(/coins|余额|Insufficient/i);

    const request = await auth.createRechargeRequest(registeredUser.id, {
      paymentMethod: "wechat",
      amountCny: 20
    });
    expect(request.coins).toBe(200);
    expect(request.status).toBe("pending");

    const adminUser = await auth.createUser({ username: "admin-test", password: "password123", role: "admin" });
    const approved = await auth.approveRechargeRequest(request.id, adminUser.id);
    expect(approved.status).toBe("approved");

    await expect(auth.getBillingStatus(registeredUser.id)).resolves.toMatchObject({
      billingMode: "coins",
      coinBalance: 200
    });

    const charge = await auth.chargeForAction({
      userId: registeredUser.id,
      action: "media.generateVideo",
      cost: GENERATION_COIN_COSTS.video,
      projectId: "project-1"
    });
    expect(charge.charged).toBe(true);
    await expect(auth.getBillingStatus(registeredUser.id)).resolves.toMatchObject({ coinBalance: 50 });

    await auth.refundCharge(charge, "provider failed");
    await expect(auth.getBillingStatus(registeredUser.id)).resolves.toMatchObject({ coinBalance: 200 });

    const freeCharge = await auth.chargeForAction({
      userId: internalUser.id,
      action: "media.generateVideo",
      cost: GENERATION_COIN_COSTS.video,
      projectId: "project-1"
    });
    expect(freeCharge.charged).toBe(false);
  });

  it("records password reset requests and lets admins complete them", async () => {
    const emailDelivery = createTestEmailDelivery();
    const auth = new AuthService({ prisma: null, emailDelivery });
    await auth.registerUser({ email: "reset-user@example.com", password: "old-password" });
    await auth.verifyEmailToken(readVerificationToken(emailDelivery));
    const adminUser = await auth.createUser({ username: "reset-admin", password: "password123", role: "admin" });

    const request = await auth.createPasswordResetRequest({
      username: "reset-user@example.com",
      contact: "wechat: user-contact"
    });

    expect(request.status).toBe("pending");
    const completed = await auth.completePasswordResetRequest(request.id, {
      password: "new-password",
      reviewedByUserId: adminUser.id
    });
    expect(completed.status).toBe("completed");

    await expect(auth.authenticate("reset-user@example.com", "old-password")).resolves.toBeUndefined();
    await expect(auth.authenticate("reset-user@example.com", "new-password")).resolves.toMatchObject({
      user: { username: "reset-user@example.com" }
    });
  });

  it("lets admins manually credit coins when a recharge request is missing", async () => {
    const auth = new AuthService({ prisma: null, emailDelivery: createTestEmailDelivery() });
    const registeredUser = await auth.registerUser({ email: "manual-credit@example.com", password: "password123" });
    const adminUser = await auth.createUser({ username: "manual-admin", password: "password123", role: "admin" });

    const updated = await auth.creditCoinsManually(registeredUser.id, {
      coins: 100,
      reviewedByUserId: adminUser.id,
      note: "paid via Alipay"
    });

    expect(updated.coinBalance).toBe(110);
    await expect(auth.getBillingStatus(registeredUser.id)).resolves.toMatchObject({ coinBalance: 110 });
  });

  it("requires email verification for self-registered accounts before login", async () => {
    const emailDelivery = createTestEmailDelivery();
    const auth = new AuthService({ prisma: null, emailDelivery });

    const registeredUser = await auth.registerUser({
      email: "verify-user@example.com",
      password: "password123",
      displayName: "Verify User"
    });

    expect(registeredUser.emailVerificationRequired).toBe(true);
    expect(registeredUser.emailVerificationSent).toBe(true);
    await expect(auth.authenticate("verify-user@example.com", "password123")).rejects.toThrow(/verified|验证/i);

    const verifiedUser = await auth.verifyEmailToken(readVerificationToken(emailDelivery));
    expect(verifiedUser.emailVerifiedAt).toBeTruthy();
    await expect(auth.authenticate("verify-user@example.com", "password123")).resolves.toMatchObject({
      user: { email: "verify-user@example.com", emailVerificationRequired: false }
    });
  });

  it("reports email verification problems in account health", async () => {
    const auth = new AuthService({ prisma: null, emailDelivery: createTestEmailDelivery() });
    await auth.registerUser({ email: "health-user@example.com", password: "password123" });

    const health = await auth.listAccountHealth();
    expect(health).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          user: expect.objectContaining({ email: "health-user@example.com" }),
          needsEmailAction: true,
          flags: expect.arrayContaining([expect.objectContaining({ code: "email_unverified" })])
        })
      ])
    );
  });
});

function createTestEmailDelivery(): EmailVerificationDelivery & { urls: string[] } {
  const urls: string[] = [];
  return {
    urls,
    isConfigured: () => true,
    async sendEmailVerification(input) {
      urls.push(input.verificationUrl);
      return { sent: true, verificationUrl: input.verificationUrl };
    }
  };
}

function readVerificationToken(emailDelivery: { urls: string[] }): string {
  const url = emailDelivery.urls.at(-1);
  if (!url) throw new Error("Missing verification url");
  const token = new URL(url).searchParams.get("token");
  if (!token) throw new Error("Missing verification token");
  return token;
}
