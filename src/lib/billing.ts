import type { AuthUser, BillingStatus } from "../types/domain";

export const GENERATION_COIN_COSTS = {
  text: 10,
  image: 20,
  video: 150
} as const;

export const RECHARGE_COINS_PER_CNY = 10;
export const BILLING_SYNC_INTERVAL_MS = 10_000;
export const RECHARGE_BILLING_SYNC_INTERVAL_MS = 2_000;
export const RECHARGE_BILLING_SYNC_WINDOW_MS = 10 * 60_000;

export type GenerationCostKind = keyof typeof GENERATION_COIN_COSTS;

export function formatGenerationCost(user: AuthUser | null | undefined, kind: GenerationCostKind): string {
  if (!user || user.billingMode === "free") return "内测免费";
  return `${GENERATION_COIN_COSTS[kind]} coins`;
}

export function canRequestRecharge(user: AuthUser | null | undefined): boolean {
  return user?.billingMode === "coins";
}

export function formatCoinBalance(user: AuthUser | null | undefined): string {
  if (!user) return "";
  if (user.billingMode === "free") return "内测免费";
  return `${user.coinBalance} coins`;
}

export function applyBillingStatusToUser(user: AuthUser, billingStatus: Pick<BillingStatus, "billingMode" | "coinBalance">): AuthUser {
  return {
    ...user,
    billingMode: billingStatus.billingMode,
    coinBalance: billingStatus.coinBalance
  };
}

export function getBillingSyncIntervalMs(
  user: AuthUser | null | undefined,
  rechargeSyncUntil: number | null | undefined,
  now = Date.now()
): number | undefined {
  if (user?.billingMode !== "coins") return undefined;
  return rechargeSyncUntil && rechargeSyncUntil > now ? RECHARGE_BILLING_SYNC_INTERVAL_MS : BILLING_SYNC_INTERVAL_MS;
}
