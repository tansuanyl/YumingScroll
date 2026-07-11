import "../src/styles.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { I18nProvider } from "../src/i18n/I18nProvider";

export const metadata: Metadata = {
  title: "喻鸣绘卷 / Yuming Scroll",
  description: "A self-hosted AI comic-video workspace for text, model images, storyboards, Flow Map, and video generation.",
  icons: {
    icon: "/brand/yuming-logo.png",
    apple: "/brand/yuming-logo.png"
  }
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <I18nProvider>{children}</I18nProvider>
      </body>
    </html>
  );
}
