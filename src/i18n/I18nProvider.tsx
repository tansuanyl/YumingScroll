"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from "react";
import {
  detectPreferredLocale,
  isLocale,
  LOCALE_STORAGE_KEY,
  translateMessage,
  type Locale,
  type TranslationValues
} from "./messages";

type I18nContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (source: string, values?: TranslationValues) => string;
  formatNumber: (value: number) => string;
  formatDateTime: (value: string | number | Date) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("zh-CN");

  useEffect(() => {
    const storedLocale = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    const nextLocale = isLocale(storedLocale)
      ? storedLocale
      : detectPreferredLocale(window.navigator.languages?.length ? window.navigator.languages : [window.navigator.language]);
    setLocaleState(nextLocale);
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dataset.locale = locale;
  }, [locale]);

  const setLocale = useCallback((nextLocale: Locale) => {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, nextLocale);
    setLocaleState(nextLocale);
  }, []);

  const value = useMemo<I18nContextValue>(() => {
    return {
      locale,
      setLocale,
      t: (source, values) => translateMessage(locale, source, values),
      formatNumber: (number) => new Intl.NumberFormat(locale).format(number),
      formatDateTime: (dateValue) => {
        const date = dateValue instanceof Date ? dateValue : new Date(dateValue);
        return Number.isNaN(date.getTime())
          ? translateMessage(locale, "未知更新时间")
          : new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(date);
      }
    };
  }, [locale, setLocale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);
  if (!context) throw new Error("useI18n must be used within I18nProvider");
  return context;
}
