export type StudyMaterial = {
  reasons: { theme: string; sentence: string }[];
  stories: { id: string; text: string }[];
  frameworks: string[];
  functions: string[];
};

export function emptyMaterial(): StudyMaterial {
  return { reasons: Array.from({ length: 12 }, () => ({ theme: "", sentence: "" })), stories: [], frameworks: [], functions: [] };
}

export function validateMaterial(value: unknown): StudyMaterial {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("素材格式无效。");
  const data = value as Record<string, unknown>;
  if (!Array.isArray(data.reasons) || data.reasons.length !== 12) throw new Error("请填写恰好 12 个核心短语。");
  const reasons = data.reasons.map((reason) => {
    if (!reason || typeof reason !== "object") throw new Error("核心短语格式无效。");
    const { theme, sentence } = reason as Record<string, unknown>;
    if (typeof theme !== "string" || !theme.trim() || theme.length > 80 || typeof sentence !== "string" || sentence.length > 500 || (sentence.match(/[a-zA-Z]+/g)?.length ?? 0) < 3) throw new Error("每个核心短语需填写主题与至少 3 个英文单词，英文句子不超过 500 字符。");
    return { theme: theme.trim(), sentence: sentence.trim() };
  });
  if (!Array.isArray(data.stories) || data.stories.length > 14) throw new Error("举例素材最多 14 条。");
  const stories = data.stories.map((story, index) => {
    if (!story || typeof story !== "object" || typeof story.text !== "string" || !story.text.trim() || story.text.length > 2000) throw new Error("每条举例素材需填写内容，且不超过 2000 字符。");
    return { id: `S${index + 1}`, text: story.text.trim() };
  });
  const strings = (field: string) => {
    const list = data[field] ?? [];
    if (!Array.isArray(list) || list.length > 20 || list.some((s) => typeof s !== "string" || s.length > 500)) throw new Error("答题句式格式无效。");
    return list.map((s: string) => s.trim()).filter(Boolean);
  };
  const result = { reasons, stories, frameworks: strings("frameworks"), functions: strings("functions") };
  if (JSON.stringify(result).length > 40000) throw new Error("素材过长，请精简至 40000 字符以内。");
  return result;
}
