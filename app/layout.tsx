import type { Metadata } from "next";
import "./globals.css";
import { headers } from "next/headers";
import { requestLanguage } from "../lib/language";
import { LanguageProvider } from "./language";

export const metadata: Metadata = {
  title: "声分 · TOEFL Speaking Studio 开源版",
  description: "新托福口语逐题练习、评分与复盘。",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const language = requestLanguage({ headers: await headers() });
  return (
    <html lang={language === "en" ? "en" : "zh-CN"}>
      <body className="antialiased"><LanguageProvider initialLanguage={language}>{children}</LanguageProvider></body>
    </html>
  );
}
