import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI 最新消息",
  description: "个人 AI 新闻 RSS 阅读器"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
