"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { Languages } from "lucide-react";
import { languageCookie, translateText, type Language } from "../lib/language";

type LanguageContextValue = { language: Language; setLanguage: (language: Language) => void; t: (text: string, ...values: unknown[]) => string };
const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ initialLanguage, children }: { initialLanguage: Language; children: React.ReactNode }) {
  const [language, update] = useState<Language>(initialLanguage);
  function setLanguage(next: Language) {
    if (next !== "zh" && next !== "en") return;
    document.cookie = languageCookie(next, location.protocol === "https:");
    update(next);
  }
  useEffect(() => {
    document.documentElement.lang = language === "en" ? "en" : "zh-CN";
    document.title = language === "en" ? "Shengfen · TOEFL Speaking Studio" : "声分 · TOEFL 口语练习评分";
  }, [language]);
  const t = (text: string, ...values: unknown[]) => translateText(text, language, ...values);
  return <LanguageContext.Provider value={{ language, setLanguage, t }}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) throw new Error("LanguageProvider is required");
  return context;
}

export function LanguageSwitcher({ disabled = false }: { disabled?: boolean }) {
  const { language, setLanguage, t } = useLanguage();
  return <label className="language-switcher"><Languages size={16} aria-hidden="true"/><span className="sr-only">{t("界面语言")}</span><select aria-label="界面语言 / Interface language" disabled={disabled} value={language} onChange={(event) => setLanguage(event.target.value as Language)}><option value="zh">中文</option><option value="en">English</option></select></label>;
}
