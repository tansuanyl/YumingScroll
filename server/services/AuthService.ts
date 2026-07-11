import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  Optional
} from "@nestjs/common";
import { Prisma, PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { env } from "../env";
import { EmailService, type EmailVerificationDelivery, type EmailDeliveryResult } from "./EmailService";

const scryptAsync = promisify(scrypt);

export type AuthRole = "admin" | "tester";
export type AuthStatus = "active" | "disabled";
export type BillingMode = "free" | "coins";
export type PaymentMethod = "wechat" | "alipay";
export type RechargeStatus = "pending" | "approved" | "rejected";
export type PasswordResetStatus = "pending" | "completed" | "rejected";

export const RECHARGE_COINS_PER_CNY = 10;
export const REGISTERED_ACCOUNT_INITIAL_COINS = 10;
export const GENERATION_COIN_COSTS = {
  text: 10,
  image: 20,
  video: 150
} as const;

export type AuthUserRecord = {
  id: string;
  username: string;
  email?: string;
  emailVerifiedAt?: string;
  emailVerificationRequired: boolean;
  emailVerificationSentAt?: string;
  emailVerificationExpiresAt?: string;
  displayName?: string;
  role: AuthRole;
  status: AuthStatus;
  billingMode: BillingMode;
  coinBalance: number;
  note?: string;
  createdAt?: string;
  updatedAt?: string;
  lastLoginAt?: string;
};

export type LoginResult = {
  user: AuthUserRecord;
  token: string;
  expiresAt: Date;
};

export type RegisterUserResult = AuthUserRecord & {
  emailVerificationSent: boolean;
  emailVerificationMailerConfigured: boolean;
  emailVerificationUrl?: string;
  emailVerificationError?: string;
};

export type AccountHealthFlagCode =
  | "email_unverified"
  | "email_verification_expired"
  | "disabled"
  | "never_logged_in"
  | "coins_empty";

export type AccountHealthRecord = {
  user: AuthUserRecord;
  flags: Array<{
    code: AccountHealthFlagCode;
    severity: "info" | "warning" | "danger";
    label: string;
  }>;
  canLogin: boolean;
  needsEmailAction: boolean;
};

type CreateUserInput = {
  username: string;
  email?: string;
  password: string;
  displayName?: string;
  role?: AuthRole;
  note?: string;
  billingMode?: BillingMode;
  initialCoins?: number;
};

type RegisterUserInput = {
  email: string;
  password: string;
  displayName?: string;
};

type UpdateUserInput = {
  password?: string;
  displayName?: string;
  role?: AuthRole;
  status?: AuthStatus;
  note?: string;
  billingMode?: BillingMode;
  coinBalance?: number;
};

type MemoryUser = AuthUserRecord & {
  passwordHash: string;
  emailVerificationTokenHash?: string;
};
type MemorySession = { id: string; userId: string; tokenHash: string; expiresAt: Date; revokedAt?: Date };
export type RechargeRequestRecord = {
  id: string;
  userId: string;
  paymentMethod: PaymentMethod;
  amountCny: number;
  coins: number;
  status: RechargeStatus;
  note?: string;
  reviewedByUserId?: string;
  reviewedAt?: string;
  createdAt?: string;
  updatedAt?: string;
};
export type PasswordResetRequestRecord = {
  id: string;
  userId: string;
  username: string;
  contact?: string;
  status: PasswordResetStatus;
  reviewedByUserId?: string;
  reviewedAt?: string;
  createdAt?: string;
  updatedAt?: string;
};
export type BillingStatus = {
  billingMode: BillingMode;
  coinBalance: number;
  costs: typeof GENERATION_COIN_COSTS;
  rechargeRateCnyToCoins: typeof RECHARGE_COINS_PER_CNY;
};
export type CoinChargeResult = {
  charged: boolean;
  userId: string;
  cost: number;
  balanceAfter?: number;
  ledgerId?: string;
};

const globalForAuthPrisma = globalThis as unknown as {
  authPrismaClient?: PrismaClient;
};

export function resolveBootstrapPassword(input: {
  password?: string;
  passwordBase64?: string;
  basicPassword?: string;
}): string {
  return decodeBase64Secret(input.passwordBase64) || input.password || input.basicPassword || "";
}

function decodeBase64Secret(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const decoded = Buffer.from(value, "base64").toString("utf8");
  return decoded || undefined;
}

function getPrismaClient(): PrismaClient | undefined {
  if (!env.DATABASE_URL) return undefined;
  if (!globalForAuthPrisma.authPrismaClient) {
    const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });
    globalForAuthPrisma.authPrismaClient = new PrismaClient({ adapter });
  }
  return globalForAuthPrisma.authPrismaClient;
}

function isAuthServiceOptions(
  value: unknown
): value is { prisma?: PrismaClient | null; emailDelivery?: EmailVerificationDelivery } {
  return Boolean(value && typeof value === "object" && ("prisma" in value || "emailDelivery" in value));
}

@Injectable()
export class AuthService {
  private readonly prisma: PrismaClient | undefined;
  private readonly emailDelivery: EmailVerificationDelivery;
  private readonly memoryUsers = new Map<string, MemoryUser>();
  private readonly memorySessions = new Map<string, MemorySession>();
  private readonly memoryRechargeRequests = new Map<string, RechargeRequestRecord>();
  private readonly memoryPasswordResetRequests = new Map<string, PasswordResetRequestRecord>();
  private readonly memoryCoinLedgers = new Map<string, CoinChargeResult>();
  private bootstrapPromise?: Promise<void>;

  constructor(
    @Optional()
    @Inject(EmailService)
    options?: EmailVerificationDelivery | { prisma?: PrismaClient | null; emailDelivery?: EmailVerificationDelivery }
  ) {
    const serviceOptions = isAuthServiceOptions(options) ? options : undefined;
    const injectedEmailDelivery = isAuthServiceOptions(options) ? undefined : options;
    this.prisma = serviceOptions?.prisma === null ? undefined : serviceOptions?.prisma ?? getPrismaClient();
    this.emailDelivery = serviceOptions?.emailDelivery ?? injectedEmailDelivery ?? new EmailService();
  }

  async authenticate(username: string, password: string): Promise<LoginResult | undefined> {
    await this.ensureBootstrapped();
    const normalizedUsername = normalizeUsername(username);
    const user = await this.findPrivateUserByLogin(normalizedUsername);
    if (!user || user.status !== "active") return undefined;
    if (!(await verifyPassword(password, user.passwordHash))) return undefined;
    if (requiresEmailVerification(user)) {
      throw new ForbiddenException("Email is not verified. Please check your inbox and verify the account before login.");
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + env.AUTH_SESSION_DAYS * 24 * 60 * 60 * 1000);
    const token = createSessionToken();
    const tokenHash = hashSessionToken(token);

    if (this.prisma) {
      await this.prisma.appUser.update({
        where: { id: user.id },
        data: { lastLoginAt: now }
      });
      await this.prisma.authSession.create({
        data: {
          id: createId("sess"),
          userId: user.id,
          tokenHash,
          expiresAt
        }
      });
    } else {
      this.memoryUsers.set(user.id, { ...user, lastLoginAt: now.toISOString() });
      this.memorySessions.set(tokenHash, {
        id: createId("sess"),
        userId: user.id,
        tokenHash,
        expiresAt
      });
    }

    return { user: sanitizeUser({ ...user, lastLoginAt: now.toISOString() }), token, expiresAt };
  }

  async getUserBySessionToken(token: string | undefined): Promise<AuthUserRecord | undefined> {
    if (!token) return undefined;
    await this.ensureBootstrapped();
    const tokenHash = hashSessionToken(token);
    const now = new Date();

    if (this.prisma) {
      const session = await this.prisma.authSession.findUnique({
        where: { tokenHash },
        include: { user: true }
      });
      if (!session || session.revokedAt || session.expiresAt <= now || session.user.status !== "active") {
        return undefined;
      }
      return sanitizeUser(session.user);
    }

    const session = this.memorySessions.get(tokenHash);
    if (!session || session.revokedAt || session.expiresAt <= now) return undefined;
    const user = this.memoryUsers.get(session.userId);
    if (!user || user.status !== "active") return undefined;
    return sanitizeUser(user);
  }

  async revokeSessionToken(token: string | undefined): Promise<void> {
    if (!token) return;
    const tokenHash = hashSessionToken(token);

    if (this.prisma) {
      await this.prisma.authSession
        .update({ where: { tokenHash }, data: { revokedAt: new Date() } })
        .catch(() => undefined);
      return;
    }

    const session = this.memorySessions.get(tokenHash);
    if (session) {
      this.memorySessions.set(tokenHash, { ...session, revokedAt: new Date() });
    }
  }

  async listUsers(): Promise<AuthUserRecord[]> {
    await this.ensureBootstrapped();
    if (this.prisma) {
      const rows = await this.prisma.appUser.findMany({ orderBy: { createdAt: "asc" } });
      return rows.map(sanitizeUser);
    }
    return Array.from(this.memoryUsers.values()).map(sanitizeUser);
  }

  async createUser(input: CreateUserInput): Promise<AuthUserRecord> {
    await this.ensureBootstrapped();
    const username = normalizeUsername(input.username);
    if (!username) throw new ConflictException("Username is required");
    const email = input.email ? normalizeEmail(input.email) : undefined;
    const passwordHash = await hashPassword(input.password);
    const billingMode = input.billingMode || "free";
    const coinBalance = Math.max(0, Math.floor(input.initialCoins || 0));
    const emailVerifiedAt = email ? new Date() : undefined;

    if (this.prisma) {
      try {
        const row = await this.prisma.appUser.create({
          data: {
            id: createId("user"),
            username,
            email: email || null,
            emailVerifiedAt: emailVerifiedAt || null,
            displayName: input.displayName?.trim() || null,
            passwordHash,
            role: input.role || "tester",
            status: "active",
            billingMode,
            coinBalance,
            note: input.note?.trim() || null
          }
        });
        return sanitizeUser(row);
      } catch (error) {
        if (isUniqueConstraintError(error)) throw new ConflictException("Username or email already exists");
        throw error;
      }
    }

    if (Array.from(this.memoryUsers.values()).some((user) => user.username === username || (email && user.email === email))) {
      throw new ConflictException("Username or email already exists");
    }
    const now = new Date().toISOString();
    const user: MemoryUser = {
      id: createId("user"),
      username,
      email,
      emailVerifiedAt: formatDate(emailVerifiedAt),
      emailVerificationRequired: false,
      displayName: input.displayName?.trim() || undefined,
      passwordHash,
      role: input.role || "tester",
      status: "active",
      billingMode,
      coinBalance,
      note: input.note?.trim() || undefined,
      createdAt: now,
      updatedAt: now
    };
    this.memoryUsers.set(user.id, user);
    return sanitizeUser(user);
  }

  async registerUser(input: RegisterUserInput): Promise<RegisterUserResult> {
    await this.ensureBootstrapped();
    const email = normalizeEmail(input.email);
    if (!email) throw new BadRequestException("A valid email is required");
    const passwordHash = await hashPassword(input.password);
    const verification = createEmailVerificationChallenge();
    const now = new Date();

    if (this.prisma) {
      try {
        const row = await this.prisma.appUser.create({
          data: {
            id: createId("user"),
            username: email,
            email,
            emailVerificationTokenHash: verification.tokenHash,
            emailVerificationExpiresAt: verification.expiresAt,
            emailVerificationSentAt: now,
            displayName: input.displayName?.trim() || null,
            passwordHash,
            role: "tester",
            status: "active",
            billingMode: "coins",
            coinBalance: REGISTERED_ACCOUNT_INITIAL_COINS,
            note: "Self-registered account"
          }
        });
        return this.dispatchVerificationEmail(row, verification.token);
      } catch (error) {
        if (isUniqueConstraintError(error)) throw new ConflictException("Email already exists");
        throw error;
      }
    }

    if (Array.from(this.memoryUsers.values()).some((user) => user.username === email || user.email === email)) {
      throw new ConflictException("Email already exists");
    }
    const user: MemoryUser = {
      id: createId("user"),
      username: email,
      email,
      emailVerificationRequired: true,
      emailVerificationTokenHash: verification.tokenHash,
      emailVerificationExpiresAt: verification.expiresAt.toISOString(),
      emailVerificationSentAt: now.toISOString(),
      displayName: input.displayName?.trim() || undefined,
      passwordHash,
      role: "tester",
      status: "active",
      billingMode: "coins",
      coinBalance: REGISTERED_ACCOUNT_INITIAL_COINS,
      note: "Self-registered account",
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    };
    this.memoryUsers.set(user.id, user);
    return this.dispatchVerificationEmail(user, verification.token);
  }

  async updateUser(id: string, input: UpdateUserInput): Promise<AuthUserRecord> {
    await this.ensureBootstrapped();
    const nextPasswordHash = input.password ? await hashPassword(input.password) : undefined;

    if (this.prisma) {
      const row = await this.prisma.appUser
        .update({
          where: { id },
          data: {
            ...(nextPasswordHash ? { passwordHash: nextPasswordHash } : {}),
            ...(input.displayName !== undefined ? { displayName: input.displayName.trim() || null } : {}),
            ...(input.role ? { role: input.role } : {}),
            ...(input.status ? { status: input.status } : {}),
            ...(input.billingMode ? { billingMode: input.billingMode } : {}),
            ...(input.coinBalance !== undefined ? { coinBalance: Math.max(0, Math.floor(input.coinBalance)) } : {}),
            ...(input.note !== undefined ? { note: input.note.trim() || null } : {})
          }
        })
        .catch((error) => {
          if ((error as { code?: string }).code === "P2025") throw new NotFoundException("User not found");
          throw error;
        });
      return sanitizeUser(row);
    }

    const user = this.memoryUsers.get(id);
    if (!user) throw new NotFoundException("User not found");
    const nextUser: MemoryUser = {
      ...user,
      ...(nextPasswordHash ? { passwordHash: nextPasswordHash } : {}),
      ...(input.displayName !== undefined ? { displayName: input.displayName.trim() || undefined } : {}),
      ...(input.role ? { role: input.role } : {}),
      ...(input.status ? { status: input.status } : {}),
      ...(input.billingMode ? { billingMode: input.billingMode } : {}),
      ...(input.coinBalance !== undefined ? { coinBalance: Math.max(0, Math.floor(input.coinBalance)) } : {}),
      ...(input.note !== undefined ? { note: input.note.trim() || undefined } : {}),
      updatedAt: new Date().toISOString()
    };
    this.memoryUsers.set(id, nextUser);
    return sanitizeUser(nextUser);
  }

  async verifyEmailToken(token: string): Promise<AuthUserRecord> {
    await this.ensureBootstrapped();
    const tokenHash = hashEmailVerificationToken(token);
    const now = new Date();

    if (this.prisma) {
      const row = await this.prisma.appUser.findUnique({ where: { emailVerificationTokenHash: tokenHash } });
      if (!row) throw new BadRequestException("Email verification link is invalid");
      if (!row.emailVerificationExpiresAt || row.emailVerificationExpiresAt <= now) {
        throw new BadRequestException("Email verification link has expired");
      }
      const verified = await this.prisma.appUser.update({
        where: { id: row.id },
        data: {
          emailVerifiedAt: now,
          emailVerificationTokenHash: null,
          emailVerificationExpiresAt: null
        }
      });
      return sanitizeUser(verified);
    }

    const user = Array.from(this.memoryUsers.values()).find((item) => item.emailVerificationTokenHash === tokenHash);
    if (!user) throw new BadRequestException("Email verification link is invalid");
    if (!user.emailVerificationExpiresAt || Date.parse(user.emailVerificationExpiresAt) <= now.getTime()) {
      throw new BadRequestException("Email verification link has expired");
    }
    const nextUser: MemoryUser = {
      ...user,
      emailVerifiedAt: now.toISOString(),
      emailVerificationRequired: false,
      emailVerificationTokenHash: undefined,
      emailVerificationExpiresAt: undefined,
      updatedAt: now.toISOString()
    };
    this.memoryUsers.set(user.id, nextUser);
    return sanitizeUser(nextUser);
  }

  async resendEmailVerificationForLogin(login: string): Promise<EmailDeliveryResult & { mailerConfigured: boolean }> {
    await this.ensureBootstrapped();
    const user = await this.findPrivateUserByLogin(login);
    if (!user?.email) throw new NotFoundException("Account email not found");
    if (user.emailVerifiedAt) {
      return {
        sent: true,
        verificationUrl: "",
        mailerConfigured: this.emailDelivery.isConfigured(),
        reason: "Email is already verified"
      };
    }
    return this.refreshAndSendVerification(user.id);
  }

  async resendEmailVerificationForUser(id: string): Promise<EmailDeliveryResult & { mailerConfigured: boolean }> {
    await this.ensureBootstrapped();
    const user = await this.findPrivateUserById(id);
    if (!user?.email) throw new NotFoundException("Account email not found");
    if (user.emailVerifiedAt) {
      return {
        sent: true,
        verificationUrl: "",
        mailerConfigured: this.emailDelivery.isConfigured(),
        reason: "Email is already verified"
      };
    }
    return this.refreshAndSendVerification(id);
  }

  async markEmailVerified(id: string): Promise<AuthUserRecord> {
    await this.ensureBootstrapped();
    const now = new Date();

    if (this.prisma) {
      const row = await this.prisma.appUser
        .update({
          where: { id },
          data: {
            emailVerifiedAt: now,
            emailVerificationTokenHash: null,
            emailVerificationExpiresAt: null
          }
        })
        .catch((error) => {
          if ((error as { code?: string }).code === "P2025") throw new NotFoundException("User not found");
          throw error;
        });
      return sanitizeUser(row);
    }

    const user = this.memoryUsers.get(id);
    if (!user) throw new NotFoundException("User not found");
    const nextUser: MemoryUser = {
      ...user,
      emailVerifiedAt: now.toISOString(),
      emailVerificationRequired: false,
      emailVerificationTokenHash: undefined,
      emailVerificationExpiresAt: undefined,
      updatedAt: now.toISOString()
    };
    this.memoryUsers.set(id, nextUser);
    return sanitizeUser(nextUser);
  }

  async listAccountHealth(): Promise<AccountHealthRecord[]> {
    await this.ensureBootstrapped();
    const users = await this.listUsers();
    return users.map((user) => {
      const flags: AccountHealthRecord["flags"] = [];
      const verificationExpired =
        user.emailVerificationRequired &&
        user.emailVerificationExpiresAt &&
        Date.parse(user.emailVerificationExpiresAt) <= Date.now();

      if (user.status === "disabled") {
        flags.push({ code: "disabled", severity: "danger", label: "账号已停用" });
      }
      if (user.emailVerificationRequired) {
        flags.push({ code: "email_unverified", severity: "warning", label: "邮箱未验证" });
      }
      if (verificationExpired) {
        flags.push({ code: "email_verification_expired", severity: "warning", label: "验证链接已过期" });
      }
      if (!user.lastLoginAt) {
        flags.push({ code: "never_logged_in", severity: "info", label: "从未登录" });
      }
      if (user.billingMode === "coins" && user.coinBalance <= 0) {
        flags.push({ code: "coins_empty", severity: "info", label: "coins 余额为 0" });
      }

      return {
        user,
        flags,
        canLogin: user.status === "active" && !user.emailVerificationRequired,
        needsEmailAction: Boolean(user.emailVerificationRequired)
      };
    });
  }

  async getBillingStatus(userId: string): Promise<BillingStatus> {
    await this.ensureBootstrapped();
    const user = await this.findPrivateUserById(userId);
    if (!user) throw new NotFoundException("User not found");
    return {
      billingMode: user.billingMode,
      coinBalance: user.coinBalance,
      costs: GENERATION_COIN_COSTS,
      rechargeRateCnyToCoins: RECHARGE_COINS_PER_CNY
    };
  }

  async chargeForAction(input: {
    userId: string;
    action: string;
    cost: number;
    projectId?: string;
    metadata?: Record<string, unknown>;
  }): Promise<CoinChargeResult> {
    await this.ensureBootstrapped();
    if (input.cost <= 0) return { charged: false, userId: input.userId, cost: 0 };
    const user = await this.findPrivateUserById(input.userId);
    if (!user) throw new NotFoundException("User not found");
    if (user.billingMode === "free") {
      return { charged: false, userId: input.userId, cost: input.cost, balanceAfter: user.coinBalance };
    }

    if (user.coinBalance < input.cost) {
      throw new ForbiddenException(`Insufficient coins. Need ${input.cost} coins, current balance ${user.coinBalance}.`);
    }

    const ledgerId = createId("coin");
    if (this.prisma) {
      const charged = await this.prisma.$transaction(async (tx) => {
        const updated = await tx.appUser.updateMany({
          where: { id: input.userId, billingMode: "coins", coinBalance: { gte: input.cost } },
          data: { coinBalance: { decrement: input.cost } }
        });
        if (updated.count !== 1) {
          throw new ForbiddenException(`Insufficient coins. Need ${input.cost} coins.`);
        }
        const nextUser = await tx.appUser.findUniqueOrThrow({ where: { id: input.userId } });
        await tx.coinLedger.create({
          data: {
            id: ledgerId,
            userId: input.userId,
            delta: -input.cost,
            balanceAfter: nextUser.coinBalance,
            type: "charge",
            action: input.action,
            projectId: input.projectId,
            metadata: input.metadata === undefined ? undefined : toJson(input.metadata)
          }
        });
        return nextUser.coinBalance;
      });
      return { charged: true, userId: input.userId, cost: input.cost, balanceAfter: charged, ledgerId };
    }

    const nextBalance = user.coinBalance - input.cost;
    this.memoryUsers.set(user.id, { ...user, coinBalance: nextBalance, updatedAt: new Date().toISOString() });
    const charge = { charged: true, userId: input.userId, cost: input.cost, balanceAfter: nextBalance, ledgerId };
    this.memoryCoinLedgers.set(ledgerId, charge);
    return charge;
  }

  async refundCharge(charge: CoinChargeResult, reason: string): Promise<void> {
    if (!charge.charged || charge.cost <= 0) return;
    await this.ensureBootstrapped();
    if (this.prisma) {
      await this.prisma.$transaction(async (tx) => {
        const updated = await tx.appUser.update({
          where: { id: charge.userId },
          data: { coinBalance: { increment: charge.cost } }
        });
        await tx.coinLedger.create({
          data: {
            id: createId("coin"),
            userId: charge.userId,
            delta: charge.cost,
            balanceAfter: updated.coinBalance,
            type: "refund",
            action: "refund",
            metadata: toJson({ reason, chargeLedgerId: charge.ledgerId })
          }
        });
      });
      return;
    }

    const user = await this.findPrivateUserById(charge.userId);
    if (!user) return;
    this.memoryUsers.set(user.id, {
      ...user,
      coinBalance: user.coinBalance + charge.cost,
      updatedAt: new Date().toISOString()
    });
  }

  async createRechargeRequest(
    userId: string,
    input: { paymentMethod: PaymentMethod; amountCny: number; note?: string }
  ): Promise<RechargeRequestRecord> {
    await this.ensureBootstrapped();
    const amountCny = Math.floor(input.amountCny);
    if (amountCny <= 0) throw new BadRequestException("Recharge amount must be greater than 0");
    const user = await this.findPrivateUserById(userId);
    if (!user) throw new NotFoundException("User not found");
    const coins = amountCny * RECHARGE_COINS_PER_CNY;

    if (this.prisma) {
      const row = await this.prisma.rechargeRequest.create({
        data: {
          id: createId("recharge"),
          userId,
          paymentMethod: input.paymentMethod,
          amountCny,
          coins,
          status: "pending",
          note: input.note?.trim() || null
        }
      });
      return sanitizeRechargeRequest(row);
    }

    const now = new Date().toISOString();
    const request: RechargeRequestRecord = {
      id: createId("recharge"),
      userId,
      paymentMethod: input.paymentMethod,
      amountCny,
      coins,
      status: "pending",
      note: input.note?.trim() || undefined,
      createdAt: now,
      updatedAt: now
    };
    this.memoryRechargeRequests.set(request.id, request);
    return request;
  }

  async listRechargeRequests(): Promise<RechargeRequestRecord[]> {
    await this.ensureBootstrapped();
    if (this.prisma) {
      const rows = await this.prisma.rechargeRequest.findMany({ orderBy: { createdAt: "desc" } });
      return rows.map(sanitizeRechargeRequest);
    }
    return Array.from(this.memoryRechargeRequests.values()).sort(compareCreatedAtDesc);
  }

  async approveRechargeRequest(id: string, reviewedByUserId: string): Promise<RechargeRequestRecord> {
    await this.ensureBootstrapped();
    if (this.prisma) {
      return this.prisma.$transaction(async (tx) => {
        const request = await tx.rechargeRequest.findUnique({ where: { id } });
        if (!request) throw new NotFoundException("Recharge request not found");
        if (request.status !== "pending") throw new ConflictException("Recharge request has already been reviewed");
        const updatedUser = await tx.appUser.update({
          where: { id: request.userId },
          data: { coinBalance: { increment: request.coins } }
        });
        await tx.coinLedger.create({
          data: {
            id: createId("coin"),
            userId: request.userId,
            delta: request.coins,
            balanceAfter: updatedUser.coinBalance,
            type: "recharge",
            action: "recharge",
            metadata: toJson({ rechargeRequestId: request.id, paymentMethod: request.paymentMethod })
          }
        });
        const row = await tx.rechargeRequest.update({
          where: { id },
          data: { status: "approved", reviewedByUserId, reviewedAt: new Date() }
        });
        return sanitizeRechargeRequest(row);
      });
    }

    const request = this.memoryRechargeRequests.get(id);
    if (!request) throw new NotFoundException("Recharge request not found");
    if (request.status !== "pending") throw new ConflictException("Recharge request has already been reviewed");
    const user = await this.findPrivateUserById(request.userId);
    if (!user) throw new NotFoundException("User not found");
    const reviewedAt = new Date().toISOString();
    this.memoryUsers.set(user.id, {
      ...user,
      coinBalance: user.coinBalance + request.coins,
      updatedAt: reviewedAt
    });
    const updatedRequest = { ...request, status: "approved" as const, reviewedByUserId, reviewedAt, updatedAt: reviewedAt };
    this.memoryRechargeRequests.set(id, updatedRequest);
    return updatedRequest;
  }

  async rejectRechargeRequest(id: string, reviewedByUserId: string): Promise<RechargeRequestRecord> {
    await this.ensureBootstrapped();
    if (this.prisma) {
      const request = await this.prisma.rechargeRequest.findUnique({ where: { id } });
      if (!request) throw new NotFoundException("Recharge request not found");
      if (request.status !== "pending") throw new ConflictException("Recharge request has already been reviewed");
      const row = await this.prisma.rechargeRequest.update({
        where: { id },
        data: { status: "rejected", reviewedByUserId, reviewedAt: new Date() }
      });
      return sanitizeRechargeRequest(row);
    }
    const request = this.memoryRechargeRequests.get(id);
    if (!request) throw new NotFoundException("Recharge request not found");
    if (request.status !== "pending") throw new ConflictException("Recharge request has already been reviewed");
    const reviewedAt = new Date().toISOString();
    const updatedRequest = { ...request, status: "rejected" as const, reviewedByUserId, reviewedAt, updatedAt: reviewedAt };
    this.memoryRechargeRequests.set(id, updatedRequest);
    return updatedRequest;
  }

  async creditCoinsManually(
    userId: string,
    input: { coins: number; reviewedByUserId: string; note?: string }
  ): Promise<AuthUserRecord> {
    await this.ensureBootstrapped();
    const coins = Math.floor(input.coins);
    if (coins <= 0) throw new BadRequestException("Coins amount must be greater than 0");

    if (this.prisma) {
      return this.prisma.$transaction(async (tx) => {
        const updated = await tx.appUser
          .update({
            where: { id: userId },
            data: { billingMode: "coins", coinBalance: { increment: coins } }
          })
          .catch((error) => {
            if ((error as { code?: string }).code === "P2025") throw new NotFoundException("User not found");
            throw error;
          });
        await tx.coinLedger.create({
          data: {
            id: createId("coin"),
            userId,
            delta: coins,
            balanceAfter: updated.coinBalance,
            type: "manual_credit",
            action: "manual_credit",
            metadata: toJson({ reviewedByUserId: input.reviewedByUserId, note: input.note?.trim() || undefined })
          }
        });
        return sanitizeUser(updated);
      });
    }

    const user = this.memoryUsers.get(userId);
    if (!user) throw new NotFoundException("User not found");
    const updatedAt = new Date().toISOString();
    const updated: MemoryUser = {
      ...user,
      billingMode: "coins",
      coinBalance: user.coinBalance + coins,
      updatedAt
    };
    this.memoryUsers.set(userId, updated);
    return sanitizeUser(updated);
  }

  async createPasswordResetRequest(input: { username: string; contact?: string }): Promise<PasswordResetRequestRecord> {
    await this.ensureBootstrapped();
    const username = normalizeUsername(input.username);
    const user = await this.findPrivateUserByLogin(username);
    if (!user) throw new NotFoundException("User not found");

    if (this.prisma) {
      const row = await this.prisma.passwordResetRequest.create({
        data: {
          id: createId("reset"),
          userId: user.id,
          contact: input.contact?.trim() || null,
          status: "pending"
        }
      });
      return sanitizePasswordResetRequest(row, user.username);
    }

    const now = new Date().toISOString();
    const request: PasswordResetRequestRecord = {
      id: createId("reset"),
      userId: user.id,
      username: user.username,
      contact: input.contact?.trim() || undefined,
      status: "pending",
      createdAt: now,
      updatedAt: now
    };
    this.memoryPasswordResetRequests.set(request.id, request);
    return request;
  }

  async listPasswordResetRequests(): Promise<PasswordResetRequestRecord[]> {
    await this.ensureBootstrapped();
    if (this.prisma) {
      const rows = await this.prisma.passwordResetRequest.findMany({
        orderBy: { createdAt: "desc" },
        include: { user: true }
      });
      return rows.map((row) => sanitizePasswordResetRequest(row, row.user.username));
    }
    return Array.from(this.memoryPasswordResetRequests.values()).sort(compareCreatedAtDesc);
  }

  async completePasswordResetRequest(
    id: string,
    input: { password: string; reviewedByUserId: string }
  ): Promise<PasswordResetRequestRecord> {
    await this.ensureBootstrapped();
    const passwordHash = await hashPassword(input.password);
    if (this.prisma) {
      return this.prisma.$transaction(async (tx) => {
        const request = await tx.passwordResetRequest.findUnique({ where: { id }, include: { user: true } });
        if (!request) throw new NotFoundException("Password reset request not found");
        if (request.status !== "pending") throw new ConflictException("Password reset request has already been reviewed");
        await tx.appUser.update({ where: { id: request.userId }, data: { passwordHash } });
        const row = await tx.passwordResetRequest.update({
          where: { id },
          data: { status: "completed", reviewedByUserId: input.reviewedByUserId, reviewedAt: new Date() },
          include: { user: true }
        });
        return sanitizePasswordResetRequest(row, row.user.username);
      });
    }

    const request = this.memoryPasswordResetRequests.get(id);
    if (!request) throw new NotFoundException("Password reset request not found");
    if (request.status !== "pending") throw new ConflictException("Password reset request has already been reviewed");
    const user = await this.findPrivateUserById(request.userId);
    if (!user) throw new NotFoundException("User not found");
    const reviewedAt = new Date().toISOString();
    this.memoryUsers.set(user.id, { ...user, passwordHash, updatedAt: reviewedAt });
    const updatedRequest = {
      ...request,
      status: "completed" as const,
      reviewedByUserId: input.reviewedByUserId,
      reviewedAt,
      updatedAt: reviewedAt
    };
    this.memoryPasswordResetRequests.set(id, updatedRequest);
    return updatedRequest;
  }

  async recordUsage(input: {
    userId?: string;
    projectId?: string;
    action: string;
    model?: string;
    status: "started" | "ready" | "failed";
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    if (!this.prisma) return;
    await this.prisma.usageLog
      .create({
        data: {
          id: createId("usage"),
          userId: input.userId,
          projectId: input.projectId,
          action: input.action,
          model: input.model,
          status: input.status,
          metadata: input.metadata === undefined ? undefined : toJson(input.metadata)
        }
      })
      .catch(() => undefined);
  }

  private async refreshAndSendVerification(id: string): Promise<EmailDeliveryResult & { mailerConfigured: boolean }> {
    const verification = createEmailVerificationChallenge();
    const sentAt = new Date();

    if (this.prisma) {
      const row = await this.prisma.appUser
        .update({
          where: { id },
          data: {
            emailVerificationTokenHash: verification.tokenHash,
            emailVerificationExpiresAt: verification.expiresAt,
            emailVerificationSentAt: sentAt
          }
        })
        .catch((error) => {
          if ((error as { code?: string }).code === "P2025") throw new NotFoundException("User not found");
          throw error;
        });
      return this.sendVerificationEmail(row, verification.token);
    }

    const user = this.memoryUsers.get(id);
    if (!user) throw new NotFoundException("User not found");
    const nextUser: MemoryUser = {
      ...user,
      emailVerificationRequired: !user.emailVerifiedAt,
      emailVerificationTokenHash: verification.tokenHash,
      emailVerificationExpiresAt: verification.expiresAt.toISOString(),
      emailVerificationSentAt: sentAt.toISOString(),
      updatedAt: sentAt.toISOString()
    };
    this.memoryUsers.set(id, nextUser);
    return this.sendVerificationEmail(nextUser, verification.token);
  }

  private async dispatchVerificationEmail(
    user: {
      id: string;
      username: string;
      email?: string | null;
      emailVerifiedAt?: Date | string | null;
      emailVerificationSentAt?: Date | string | null;
      emailVerificationExpiresAt?: Date | string | null;
      displayName?: string | null;
      role: string;
      status: string;
      billingMode?: string | null;
      coinBalance?: number | null;
      note?: string | null;
      createdAt?: Date | string;
      updatedAt?: Date | string;
      lastLoginAt?: Date | string | null;
    },
    token: string
  ): Promise<RegisterUserResult> {
    const delivery = await this.sendVerificationEmail(user, token);
    return {
      ...sanitizeUser(user),
      emailVerificationSent: delivery.sent,
      emailVerificationMailerConfigured: delivery.mailerConfigured,
      emailVerificationUrl: env.APP_ENV === "production" ? undefined : delivery.verificationUrl,
      emailVerificationError: delivery.reason
    };
  }

  private async sendVerificationEmail(
    user: { email?: string | null; displayName?: string | null },
    token: string
  ): Promise<EmailDeliveryResult & { mailerConfigured: boolean }> {
    if (!user.email) throw new NotFoundException("Account email not found");
    const delivery = await this.emailDelivery.sendEmailVerification({
      to: user.email,
      displayName: user.displayName || undefined,
      verificationUrl: buildEmailVerificationUrl(token)
    });
    return { ...delivery, mailerConfigured: this.emailDelivery.isConfigured() };
  }

  private async ensureBootstrapped(): Promise<void> {
    if (!this.bootstrapPromise) {
      this.bootstrapPromise = this.bootstrapDefaultAdmin();
    }
    await this.bootstrapPromise;
  }

  private async bootstrapDefaultAdmin(): Promise<void> {
    const username = normalizeUsername(env.AUTH_BOOTSTRAP_USERNAME || process.env.BASIC_AUTH_USER || "");
    const password = resolveBootstrapPassword({
      password: env.AUTH_BOOTSTRAP_PASSWORD,
      passwordBase64: env.AUTH_BOOTSTRAP_PASSWORD_B64,
      basicPassword: process.env.BASIC_AUTH_PASSWORD
    });
    if (!username || !password) return;
    const syncPassword = env.AUTH_BOOTSTRAP_SYNC_PASSWORD === "true";

    if (this.prisma) {
      const existing = await this.prisma.appUser.findUnique({ where: { username } });
      if (existing) {
        if (syncPassword && !(await verifyPassword(password, existing.passwordHash))) {
          await this.prisma.appUser.update({
            where: { id: existing.id },
            data: {
              passwordHash: await hashPassword(password),
              role: "admin",
              status: "active"
            }
          });
        }
        return;
      }
      await this.prisma.appUser.create({
        data: {
          id: createId("user"),
          username,
          passwordHash: await hashPassword(password),
          displayName: "Admin",
          role: "admin",
          status: "active",
          billingMode: "free",
          coinBalance: 0,
          note: "Bootstrap administrator"
        }
      });
      return;
    }

    const existingMemoryUser = Array.from(this.memoryUsers.values()).find((user) => user.username === username);
    if (existingMemoryUser) {
      if (syncPassword && !(await verifyPassword(password, existingMemoryUser.passwordHash))) {
        this.memoryUsers.set(existingMemoryUser.id, {
          ...existingMemoryUser,
          passwordHash: await hashPassword(password),
          role: "admin",
          status: "active",
          updatedAt: new Date().toISOString()
        });
      }
      return;
    }
    const now = new Date().toISOString();
    const id = createId("user");
    this.memoryUsers.set(id, {
      id,
      username,
      emailVerificationRequired: false,
      passwordHash: await hashPassword(password),
      displayName: "Admin",
      role: "admin",
      status: "active",
      billingMode: "free",
      coinBalance: 0,
      note: "Bootstrap administrator",
      createdAt: now,
      updatedAt: now
    });
  }

  private async findPrivateUserByLogin(username: string): Promise<(AuthUserRecord & { passwordHash: string }) | undefined> {
    if (this.prisma) {
      const row = await this.prisma.appUser.findFirst({
        where: {
          OR: [{ username }, { email: username }]
        }
      });
      return row ? { ...sanitizeUser(row), passwordHash: row.passwordHash } : undefined;
    }
    return Array.from(this.memoryUsers.values()).find((user) => user.username === username || user.email === username);
  }

  private async findPrivateUserById(id: string): Promise<(AuthUserRecord & { passwordHash: string }) | undefined> {
    if (this.prisma) {
      const row = await this.prisma.appUser.findUnique({ where: { id } });
      return row ? { ...sanitizeUser(row), passwordHash: row.passwordHash } : undefined;
    }
    return this.memoryUsers.get(id);
  }
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("base64url");
  const derivedKey = (await scryptAsync(password, salt, 64)) as Buffer;
  return `scrypt$${salt}$${derivedKey.toString("base64url")}`;
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const [algorithm, salt, expected] = storedHash.split("$");
  if (algorithm !== "scrypt" || !salt || !expected) return false;
  const actual = (await scryptAsync(password, salt, 64)) as Buffer;
  const expectedBuffer = Buffer.from(expected, "base64url");
  return actual.length === expectedBuffer.length && timingSafeEqual(actual, expectedBuffer);
}

export function createSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("base64url");
}

function createEmailVerificationChallenge(): { token: string; tokenHash: string; expiresAt: Date } {
  const token = randomBytes(32).toString("base64url");
  return {
    token,
    tokenHash: hashEmailVerificationToken(token),
    expiresAt: new Date(Date.now() + env.EMAIL_VERIFICATION_HOURS * 60 * 60 * 1000)
  };
}

function hashEmailVerificationToken(token: string): string {
  return createHash("sha256").update(`email:${token}`).digest("base64url");
}

function buildEmailVerificationUrl(token: string): string {
  const baseUrl = resolvePublicApiBaseUrl();
  const url = new URL("/api/auth/verify-email", baseUrl);
  url.searchParams.set("token", token);
  return url.toString();
}

function resolvePublicApiBaseUrl(): string {
  if (env.APP_PUBLIC_URL) return env.APP_PUBLIC_URL;
  const webOrigin = new URL(env.WEB_ORIGIN);
  if ((webOrigin.hostname === "127.0.0.1" || webOrigin.hostname === "localhost") && webOrigin.port === "5173") {
    return `http://127.0.0.1:${env.PORT}`;
  }
  return env.WEB_ORIGIN;
}

function requiresEmailVerification(user: Pick<AuthUserRecord, "email" | "emailVerifiedAt">): boolean {
  return Boolean(user.email && !user.emailVerifiedAt);
}

function sanitizeUser(row: {
  id: string;
  username: string;
  email?: string | null;
  emailVerifiedAt?: Date | string | null;
  emailVerificationSentAt?: Date | string | null;
  emailVerificationExpiresAt?: Date | string | null;
  displayName?: string | null;
  role: string;
  status: string;
  billingMode?: string | null;
  coinBalance?: number | null;
  note?: string | null;
  createdAt?: Date | string;
  updatedAt?: Date | string;
  lastLoginAt?: Date | string | null;
}): AuthUserRecord {
  return {
    id: row.id,
    username: row.username,
    email: row.email || undefined,
    emailVerifiedAt: formatDate(row.emailVerifiedAt),
    emailVerificationRequired: Boolean(row.email && !row.emailVerifiedAt),
    emailVerificationSentAt: formatDate(row.emailVerificationSentAt),
    emailVerificationExpiresAt: formatDate(row.emailVerificationExpiresAt),
    displayName: row.displayName || undefined,
    role: row.role === "admin" ? "admin" : "tester",
    status: row.status === "disabled" ? "disabled" : "active",
    billingMode: row.billingMode === "coins" ? "coins" : "free",
    coinBalance: typeof row.coinBalance === "number" ? row.coinBalance : 0,
    note: row.note || undefined,
    createdAt: formatDate(row.createdAt),
    updatedAt: formatDate(row.updatedAt),
    lastLoginAt: formatDate(row.lastLoginAt)
  };
}

function sanitizeRechargeRequest(row: {
  id: string;
  userId: string;
  paymentMethod: string;
  amountCny: number;
  coins: number;
  status: string;
  note?: string | null;
  reviewedByUserId?: string | null;
  reviewedAt?: Date | string | null;
  createdAt?: Date | string;
  updatedAt?: Date | string;
}): RechargeRequestRecord {
  return {
    id: row.id,
    userId: row.userId,
    paymentMethod: row.paymentMethod === "alipay" ? "alipay" : "wechat",
    amountCny: row.amountCny,
    coins: row.coins,
    status: parseRechargeStatus(row.status),
    note: row.note || undefined,
    reviewedByUserId: row.reviewedByUserId || undefined,
    reviewedAt: formatDate(row.reviewedAt),
    createdAt: formatDate(row.createdAt),
    updatedAt: formatDate(row.updatedAt)
  };
}

function sanitizePasswordResetRequest(
  row: {
    id: string;
    userId: string;
    contact?: string | null;
    status: string;
    reviewedByUserId?: string | null;
    reviewedAt?: Date | string | null;
    createdAt?: Date | string;
    updatedAt?: Date | string;
  },
  username: string
): PasswordResetRequestRecord {
  return {
    id: row.id,
    userId: row.userId,
    username,
    contact: row.contact || undefined,
    status: parsePasswordResetStatus(row.status),
    reviewedByUserId: row.reviewedByUserId || undefined,
    reviewedAt: formatDate(row.reviewedAt),
    createdAt: formatDate(row.createdAt),
    updatedAt: formatDate(row.updatedAt)
  };
}

function parseRechargeStatus(value: string): RechargeStatus {
  if (value === "approved" || value === "rejected") return value;
  return "pending";
}

function parsePasswordResetStatus(value: string): PasswordResetStatus {
  if (value === "completed" || value === "rejected") return value;
  return "pending";
}

function compareCreatedAtDesc<T extends { createdAt?: string }>(left: T, right: T): number {
  return Date.parse(right.createdAt || "") - Date.parse(left.createdAt || "");
}

function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

function normalizeEmail(email: string): string {
  const normalized = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) return "";
  return normalized;
}

function createId(prefix: string): string {
  return `${prefix}_${randomBytes(12).toString("hex")}`;
}

function formatDate(value: Date | string | null | undefined): string | undefined {
  if (!value) return undefined;
  return value instanceof Date ? value.toISOString() : value;
}

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}
