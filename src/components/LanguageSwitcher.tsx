import { Languages } from "lucide-react";
import { useI18n } from "../i18n/I18nProvider";

type LanguageSwitcherProps = {
  compact?: boolean;
  className?: string;
};

export function LanguageSwitcher({ compact = false, className = "" }: LanguageSwitcherProps) {
  const { locale, setLocale, t } = useI18n();

  if (compact) {
    const nextLocale = locale === "zh-CN" ? "en" : "zh-CN";
    const label = locale === "zh-CN" ? t("切换到英文") : t("切换到中文");
    return (
      <button
        type="button"
        className={["language-switcher-compact", className].filter(Boolean).join(" ")}
        title={label}
        aria-label={label}
        onClick={() => setLocale(nextLocale)}
      >
        <Languages size={16} />
        <span>{locale === "zh-CN" ? "EN" : "中"}</span>
      </button>
    );
  }

  return (
    <div
      className={["language-switcher", className].filter(Boolean).join(" ")}
      role="group"
      aria-label={t("界面语言")}
    >
      <Languages size={15} aria-hidden="true" />
      <button type="button" className={locale === "zh-CN" ? "active" : ""} aria-pressed={locale === "zh-CN"} onClick={() => setLocale("zh-CN")}>
        中
      </button>
      <button type="button" className={locale === "en" ? "active" : ""} aria-pressed={locale === "en"} onClick={() => setLocale("en")}>
        EN
      </button>
    </div>
  );
}
