import english from "./messages-en.json";

export type Language = "zh" | "en";
export const LANGUAGE_COOKIE = "studio_language";
const messages: Record<string, string> = english;
const reverse = new Map(Object.entries(messages).filter(([, value]) => value).map(([key, value]) => [value, key]));
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function pattern(text: string) {
  const indexes: number[] = [];
  const parts = text.split(/(\{\d+\})/g).map((part) => {
    if (/^\{\d+\}$/.test(part)) { indexes.push(Number(part.slice(1, -1))); return "(.*?)"; }
    return escape(part);
  });
  return { regex: new RegExp(`^${parts.join("")}$`, "s"), indexes };
}
const patterns = Object.entries(messages).filter(([key]) => /\{\d+\}/.test(key)).map(([zh, en]) => ({ zh, en, zhPattern: pattern(zh), enPattern: pattern(en) }));
function fill(text: string, values: unknown[]) { return text.replace(/\{(\d+)\}/g, (match, i) => values[Number(i)] === undefined ? match : String(values[Number(i)])); }

export function translateText(text: string, language: Language, ...values: unknown[]): string {
  const direct = language === "en" ? messages[text] : reverse.get(text);
  if (direct !== undefined) return fill(direct, values);
  if (values.length) return fill(text, values);
  if (language === "en" && text.startsWith("：")) return `: ${translateText(text.slice(1), language)}`;
  // Status codes and their optional detail are adjacent in this error template.
  const provider = text.match(language === "en" ? /^ztoken (.+) 接口返回 (\d{3})([\s\S]*)$/ : /^ztoken (.+) returned (\d{3})([\s\S]*)$/);
  if (provider) return language === "en" ? `ztoken ${provider[1]} returned ${provider[2]}${translateText(provider[3], language)}` : `ztoken ${provider[1]} 接口返回 ${provider[2]}${translateText(provider[3], language)}`;
  for (const entry of patterns) {
    const source = language === "en" ? entry.zhPattern : entry.enPattern;
    const match = text.match(source.regex);
    if (!match) continue;
    const args: unknown[] = [];
    source.indexes.forEach((index, i) => { args[index] = translateText(match[i + 1], language); });
    return fill(language === "en" ? entry.en : entry.zh, args);
  }
  return text;
}

export function languageFromCookie(cookie: string | null | undefined): Language {
  return cookie?.split(";").some((part) => part.trim() === `${LANGUAGE_COOKIE}=en`) ? "en" : "zh";
}
export function requestLanguage(request?: { headers: Pick<Headers, "get"> }): Language {
  const explicit = request?.headers.get("x-studio-language");
  return explicit === "en" || explicit === "zh" ? explicit : languageFromCookie(request?.headers.get("cookie"));
}
export function languageCookie(language: Language, secure = false) {
  return `${LANGUAGE_COOKIE}=${language}; Path=/; Max-Age=31536000; SameSite=Lax${secure ? "; Secure" : ""}`;
}
export function clientLanguage(): Language { return typeof document === "undefined" ? "zh" : languageFromCookie(document.cookie); }
export function clientTranslate(text: string, ...values: unknown[]) { return translateText(text, clientLanguage(), ...values); }
export function feedbackLanguageInstruction(language: Language) {
  return language === "en"
    ? "OUTPUT LANGUAGE: Write all feedback and explanation fields (audibleEvidence, reason, advice, note, optimizationNote, reasonNote, reuseNote) in English, overriding earlier Chinese-language wording instructions. Keep the answer/transcript in the original spoken English, all JSON field names unchanged, and source quotations unchanged. Do not change scoring standards because of this language preference."
    : "输出语言：所有反馈与说明字段使用简体中文。英文题目、听写、推荐回答及引用素材保持原文；JSON 字段名不变。语言偏好不影响评分标准。";
}
