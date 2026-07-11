import type { PaymentMethod } from "../types/domain";

export type RechargePaymentOption = {
  value: PaymentMethod;
  label: string;
  qr: string;
  enabled: boolean;
  disabledLabel?: string;
};

function resolveQrUrl(value: string | undefined): string {
  const url = value?.trim() || "";
  if (url.startsWith("/") || url.startsWith("https://")) return url;
  return "";
}

export function createRechargePaymentOptions(config: {
  wechatQrUrl?: string;
  alipayQrUrl?: string;
}): RechargePaymentOption[] {
  const wechatQrUrl = resolveQrUrl(config.wechatQrUrl);
  const alipayQrUrl = resolveQrUrl(config.alipayQrUrl);

  return [
    {
      value: "wechat",
      label: "微信支付",
      qr: wechatQrUrl,
      enabled: Boolean(wechatQrUrl),
      disabledLabel: "未配置"
    },
    {
      value: "alipay",
      label: "支付宝",
      qr: alipayQrUrl,
      enabled: Boolean(alipayQrUrl),
      disabledLabel: "未配置"
    }
  ];
}

export const rechargePaymentOptions = createRechargePaymentOptions({
  wechatQrUrl: process.env.NEXT_PUBLIC_RECHARGE_WECHAT_QR_URL,
  alipayQrUrl: process.env.NEXT_PUBLIC_RECHARGE_ALIPAY_QR_URL
});

export function getDefaultRechargePaymentMethod(): PaymentMethod {
  return rechargePaymentOptions.find((option) => option.value === "alipay" && option.enabled)?.value ||
    rechargePaymentOptions.find((option) => option.enabled)?.value ||
    "alipay";
}

export function hasConfiguredRechargePaymentMethod(): boolean {
  return rechargePaymentOptions.some((option) => option.enabled);
}
