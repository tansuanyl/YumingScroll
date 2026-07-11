import "../src/styles.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "喻鸣绘卷",
  description: "喻鸣绘卷支持文本、模型图和 Seedance 视频 Flow Map 生成。",
  icons: {
    icon: "/brand/yuming-logo.png",
    apple: "/brand/yuming-logo.png"
  }
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
