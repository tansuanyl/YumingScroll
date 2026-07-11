import { describe, expect, it } from "vitest";
import {
  BILLING_SYNC_INTERVAL_MS,
  RECHARGE_BILLING_SYNC_INTERVAL_MS,
  applyBillingStatusToUser,
  canRequestRecharge,
  getBillingSyncIntervalMs
} from "../src/lib/billing";
import type { AuthUser } from "../src/types/domain";

function userWithBilling(billingMode: AuthUser["billingMode"]): AuthUser {
  return {
    id: `user-${billingMode}`,
    username: `${billingMode}-user`,
    role: "tester",
    status: "active",
    billingMode,
    coinBalance: billingMode === "coins" ? 30 : 0
  };
}

describe("billing helpers", () => {
  it("allows the balance pill to open recharge only for coins accounts", () => {
    expect(canRequestRecharge(userWithBilling("coins"))).toBe(true);
    expect(canRequestRecharge(userWithBilling("free"))).toBe(false);
    expect(canRequestRecharge(null)).toBe(false);
  });

  it("applies refreshed billing status to the current user", () => {
    expect(applyBillingStatusToUser(userWithBilling("coins"), { billingMode: "coins", coinBalance: 120 })).toMatchObject({
      billingMode: "coins",
      coinBalance: 120
    });
  });

  it("uses a faster balance sync interval while a recharge may be pending", () => {
    const now = 1_000;

    expect(getBillingSyncIntervalMs(userWithBilling("coins"), now + 10_000, now)).toBe(RECHARGE_BILLING_SYNC_INTERVAL_MS);
    expect(getBillingSyncIntervalMs(userWithBilling("coins"), now - 1, now)).toBe(BILLING_SYNC_INTERVAL_MS);
    expect(getBillingSyncIntervalMs(userWithBilling("free"), now + 10_000, now)).toBeUndefined();
  });
});
