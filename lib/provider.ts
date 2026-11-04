import { env } from "cloudflare:workers";
import { getBindings, HttpError } from "./server";

export const API_BASE = "https://api.ztoken.pro/v1";
export type Models = { text: string; audio: string; answer: string };
export const DEFAULT_MODELS: Models = { text: "gpt-4o", audio: "gpt-audio-1.5", answer: "gpt-6.1-sol" };
export class ProviderError extends HttpError {
  constructor(public upstreamStatus: number, path: string, detail?: string) {
    super(502, `ztoken ${path} 接口返回 ${upstreamStatus}${detail ? `：${detail}` : "。请检查 API 设置后重试。"}`);
  }
}
type Credential = { ciphertext: string; iv: string; models: string };
type StoredModels = Partial<Models> & { answerModelPreferenceVersion?: number };

function decode(value: string): Uint8Array { return Uint8Array.from(atob(value), (letter) => letter.charCodeAt(0)); }
function encode(value: Uint8Array): string { return btoa(String.fromCharCode(...value)); }
async function cipherKey() {
  if (!env.ZTOKEN_ENCRYPTION_KEY) throw new HttpError(503, "站点密钥保护尚未配置，请稍后重试。");
  const raw = decode(env.ZTOKEN_ENCRYPTION_KEY);
  if (raw.length !== 32) throw new HttpError(503, "站点密钥保护配置无效。");
  return crypto.subtle.importKey("raw", raw as BufferSource, "AES-GCM", false, ["encrypt", "decrypt"]);
}
export async function getCredential(ownerId: string): Promise<{ key: string; models: Models }> {
  const { db } = getBindings();
  const row = await db.prepare("SELECT ciphertext, iv, models FROM provider_credentials WHERE owner_id = ?").bind(ownerId).first<Credential>();
  if (!row) throw new HttpError(503, "请先在 API 设置中保存 ztoken 密钥，再开始识别或评分。");
  let key: string;
  try {
    const bytes = await crypto.subtle.decrypt({ name: "AES-GCM", iv: decode(row.iv) as BufferSource }, await cipherKey(), decode(row.ciphertext) as BufferSource);
    key = new TextDecoder().decode(bytes);
  } catch { throw new HttpError(503, "无法读取 ztoken 密钥，请在 API 设置中重新保存。"); }
  const saved = JSON.parse(row.models) as StoredModels;
  if (saved.answer === "gpt-6-astra" && saved.answerModelPreferenceVersion !== 2) {
    saved.answer = DEFAULT_MODELS.answer;
    saved.answerModelPreferenceVersion = 2;
    await db.prepare("UPDATE provider_credentials SET models = ?, updated_at = ? WHERE owner_id = ? AND models = ?")
      .bind(JSON.stringify(saved), new Date().toISOString(), ownerId, row.models).run();
  }
  return { key, models: { ...DEFAULT_MODELS, ...saved } };
}
export async function saveCredential(ownerId: string, key: string, models: Models) {
  if (!/^\S{10,500}$/.test(key)) throw new HttpError(400, "请输入有效的 ztoken API 密钥。");
  if (Object.values(models).some((value) => !/^[a-zA-Z0-9._:-]{2,100}$/.test(value))) throw new HttpError(400, "模型名称格式不正确。");
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await cipherKey(), new TextEncoder().encode(key)));
  const { db } = getBindings();
  await db.prepare("INSERT INTO provider_credentials (owner_id, ciphertext, iv, models, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(owner_id) DO UPDATE SET ciphertext=excluded.ciphertext, iv=excluded.iv, models=excluded.models, updated_at=excluded.updated_at")
    .bind(ownerId, encode(ciphertext), encode(iv), JSON.stringify({ ...models, answerModelPreferenceVersion: 2 }), new Date().toISOString()).run();
}
export async function providerJson(ownerId: string, path: string, payload: unknown) {
  const { key } = await getCredential(ownerId);
  const response = await fetch(`${API_BASE}/${path}`, { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  const data = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    const error = data.error && typeof data.error === "object" ? data.error as Record<string, unknown> : {};
    const detail = [error.message, data.message, data.msg]
      .find((value): value is string => typeof value === "string" && value.trim().length > 0)
      ?.replace(/sk-[a-zA-Z0-9_-]{8,}/g, "[密钥已隐藏]")
      .replace(/Bearer\s+\S+/gi, "Bearer [密钥已隐藏]")
      .trim().slice(0, 300);
    throw new ProviderError(response.status, path, detail);
  }
  return data;
}
