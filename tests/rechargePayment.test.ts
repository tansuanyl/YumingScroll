import { describe, expect, it } from "vitest";
import {
  createRechargePaymentOptions,
  getDefaultRechargePaymentMethod,
  hasConfiguredRechargePaymentMethod,
  rechargePaymentOptions
} from "../src/lib/rechargePayment";

describe("recharge payment options", () => {
  it("keeps payment methods disabled until public QR URLs are configured", () => {
    expect(getDefaultRechargePaymentMethod()).toBe("alipay");
    expect(hasConfiguredRechargePaymentMethod()).toBe(false);

    const alipay = rechargePaymentOptions.find((option) => option.value === "alipay");
    const wechat = rechargePaymentOptions.find((option) => option.value === "wechat");

    expect(alipay).toMatchObject({
      enabled: false,
      label: "支付宝",
      qr: "",
      disabledLabel: "未配置"
    });
    expect(wechat).toMatchObject({
      enabled: false,
      label: "微信支付",
      qr: "",
      disabledLabel: "未配置"
    });
  });

  it("enables only safe configured QR URLs", () => {
    const options = createRechargePaymentOptions({
      wechatQrUrl: "/operator-assets/wechat.png",
      alipayQrUrl: "http://insecure.example/alipay.png"
    });

    expect(options[0]).toMatchObject({ enabled: true, qr: "/operator-assets/wechat.png" });
    expect(options[1]).toMatchObject({ enabled: false, qr: "" });

    const httpsOptions = createRechargePaymentOptions({
      alipayQrUrl: "https://cdn.example.com/alipay.png"
    });
    expect(httpsOptions[1]).toMatchObject({ enabled: true, qr: "https://cdn.example.com/alipay.png" });
  });
});
