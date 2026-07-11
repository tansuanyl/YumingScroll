type BrandMarkProps = {
  className?: string;
  compact?: boolean;
  logoClassName?: string;
  wordmarkClassName?: string;
};

export function BrandMark({ className = "", compact = false, logoClassName = "", wordmarkClassName = "" }: BrandMarkProps) {
  return (
    <span className={["brand-mark", compact ? "compact" : "", className].filter(Boolean).join(" ")} aria-label="喻鸣绘卷">
      <img className={["brand-logo", logoClassName].filter(Boolean).join(" ")} src="/brand/yuming-logo.png" alt="" />
      <img
        className={["brand-wordmark", wordmarkClassName].filter(Boolean).join(" ")}
        src="/brand/yuming-wordmark.png"
        alt="喻鸣绘卷"
      />
    </span>
  );
}
