"use client";

import { useI18n } from "../i18n/I18nProvider";

type BrandMarkProps = {
  className?: string;
  compact?: boolean;
  logoClassName?: string;
  wordmarkClassName?: string;
};

export function BrandMark({ className = "", compact = false, logoClassName = "", wordmarkClassName = "" }: BrandMarkProps) {
  const { locale } = useI18n();
  const brandLabel = locale === "en" ? "Yuming Scroll" : "喻鸣绘卷";
  return (
    <span className={["brand-mark", compact ? "compact" : "", className].filter(Boolean).join(" ")} aria-label={brandLabel}>
      <img className={["brand-logo", logoClassName].filter(Boolean).join(" ")} src="/brand/yuming-logo.png" alt="" />
      <img
        className={["brand-wordmark", wordmarkClassName].filter(Boolean).join(" ")}
        src="/brand/yuming-wordmark.png"
        alt={brandLabel}
      />
    </span>
  );
}
