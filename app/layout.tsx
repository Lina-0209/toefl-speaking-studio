import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "声分 · TOEFL Speaking Studio 开源版",
  description: "新托福口语逐题练习、评分与复盘。",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
