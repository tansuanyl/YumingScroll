import { useState } from "react";
import { CreditCard, QrCode, X } from "lucide-react";
import { apiClient } from "../lib/apiClient";
import { RECHARGE_COINS_PER_CNY } from "../lib/billing";
import { getDefaultRechargePaymentMethod, rechargePaymentOptions } from "../lib/rechargePayment";
import type { AuthUser, PaymentMethod } from "../types/domain";

type RechargeDialogProps = {
  user: AuthUser;
  onClose: () => void;
  onSubmitted: () => void | Promise<void>;
};

export function RechargeDialog({ user, onClose, onSubmitted }: RechargeDialogProps) {
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(() => getDefaultRechargePaymentMethod());
  const [amountCny, setAmountCny] = useState(10);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const selectedOption =
    rechargePaymentOptions.find((option) => option.value === paymentMethod && option.enabled) ||
    rechargePaymentOptions.find((option) => option.enabled) ||
    rechargePaymentOptions[0];
  const coins = Math.max(0, Math.floor(amountCny || 0)) * RECHARGE_COINS_PER_CNY;

  async function submitRecharge() {
    if (submitting || amountCny <= 0 || !selectedOption?.enabled) return;
    setSubmitting(true);
    setMessage(null);
    setError(null);
    try {
      const request = await apiClient.createRechargeRequest({
        paymentMethod: selectedOption.value,
        amountCny,
        note: note || undefined
      });
      setMessage(`充值申请已提交：${request.amountCny} 元 / ${request.coins} coins，管理员确认收款后到账。`);
      await onSubmitted();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "充值申请提交失败");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="workflow-video-dialog-backdrop" onClick={onClose}>
      <section className="recharge-dialog" role="dialog" aria-modal="true" aria-labelledby="recharge-title" onClick={(event) => event.stopPropagation()}>
        <header>
          <div>
            <span className="eyebrow">Coins Recharge</span>
            <h2 id="recharge-title">充值 coins</h2>
            <p>人民币 1 元 = {RECHARGE_COINS_PER_CNY} coins。扫码付款后提交申请，管理员确认后到账。</p>
          </div>
          <button type="button" className="workflow-dialog-close" onClick={onClose} aria-label="关闭充值弹窗">
            <X size={18} />
          </button>
        </header>

        <div className="recharge-body">
          <div className="recharge-methods">
            {rechargePaymentOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                className={[
                  paymentMethod === option.value && option.enabled ? "active" : "",
                  !option.enabled ? "disabled" : ""
                ].filter(Boolean).join(" ")}
                disabled={!option.enabled || submitting}
                onClick={() => {
                  if (option.enabled) setPaymentMethod(option.value);
                }}
              >
                <QrCode size={16} />
                {option.label}
                {!option.enabled && option.disabledLabel ? <small>{option.disabledLabel}</small> : null}
              </button>
            ))}
          </div>

          <div className="recharge-grid">
            <div className="recharge-qr-card">
              {selectedOption?.enabled ? (
                <>
                  <img src={selectedOption.qr} alt={`${selectedOption.label} 收款二维码`} />
                  <strong>{selectedOption.label}</strong>
                </>
              ) : (
                <div className="empty-state">当前部署未配置充值方式</div>
              )}
            </div>

            <div className="recharge-form">
              <div className="billing-balance-card">
                <span>当前账号</span>
                <strong>{user.displayName || user.username}</strong>
                <small>余额：{user.coinBalance} coins</small>
              </div>
              <label className="form-field">
                <span>付款金额（人民币）</span>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={amountCny}
                  onChange={(event) => setAmountCny(Number(event.target.value))}
                />
              </label>
              <div className="recharge-preview">
                <CreditCard size={16} />
                <span>到账 {coins} coins</span>
              </div>
              <label className="form-field">
                <span>付款备注（可填付款时间或昵称）</span>
                <input value={note} onChange={(event) => setNote(event.target.value)} placeholder="便于管理员核对到账" />
              </label>
              <button type="button" className="primary-button" disabled={submitting || amountCny <= 0 || !selectedOption?.enabled} onClick={() => void submitRecharge()}>
                {submitting ? "提交中..." : "我已付款，提交充值申请"}
              </button>
              {message ? <div className="admin-message">{message}</div> : null}
              {error ? <div className="login-error">{error}</div> : null}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
