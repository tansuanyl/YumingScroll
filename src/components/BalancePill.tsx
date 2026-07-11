import { Coins } from "lucide-react";
import { canRequestRecharge, formatCoinBalance } from "../lib/billing";
import { hasConfiguredRechargePaymentMethod } from "../lib/rechargePayment";
import type { AuthUser } from "../types/domain";

type BalancePillProps = {
  user: AuthUser;
  onOpenRecharge: () => void;
  className?: string;
};

export function BalancePill({ user, onOpenRecharge, className = "" }: BalancePillProps) {
  const canRecharge = canRequestRecharge(user) && hasConfiguredRechargePaymentMethod();
  const classes = ["balance-pill", canRecharge ? "clickable" : "readonly", className].filter(Boolean).join(" ");
  const label = formatCoinBalance(user);

  if (!canRecharge) {
    return (
      <div className={classes} aria-label={`当前余额 ${label}`}>
        <Coins size={16} />
        <span>当前余额</span>
        <strong>{label}</strong>
      </div>
    );
  }

  return (
    <button type="button" className={classes} title="点击充值 coins" aria-label={`当前余额 ${label}，点击充值`} onClick={onOpenRecharge}>
      <Coins size={16} />
      <span>当前余额</span>
      <strong>{label}</strong>
    </button>
  );
}
