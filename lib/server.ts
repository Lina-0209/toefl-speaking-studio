import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../app/chatgpt-auth";
import { Attempt, emptyFiles, emptyPrompts, emptyResults, StoredFile } from "./attempt";

type AttemptRow = {
  id: string; owner_id: string; created_at: string; updated_at: string; title: string;
  prompts: string; images: string; audio: string; results: string;
  band: number | null; band_note: string | null; status: string;
};

export function getBindings() {
  if (!env.DB || !env.BUCKET) throw new HttpError(503, "练习存储暂时不可用，请稍后重试。");
  return { db: env.DB, bucket: env.BUCKET };
}

export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin || request.headers.get("sec-fetch-site") === "cross-site") {
    throw new HttpError(403, "请从本站页面提交操作。");
  }
}

export async function requireOwner(): Promise<string> {
  const user = await getChatGPTUser();
  if (!user) throw new HttpError(401, "请先登录后继续。");
  return user.userId;
}

export async function getOwnedAttempt(id: string, ownerId: string): Promise<AttemptRow> {
  const { db } = getBindings();
  const row = await db.prepare("SELECT * FROM attempts WHERE id = ? AND owner_id = ?").bind(id, ownerId).first<AttemptRow>();
  if (!row) throw new HttpError(404, "找不到这次练习。");
  return row;
}

export function toAttempt(row: AttemptRow): Attempt {
  return {
    id: row.id, createdAt: row.created_at, updatedAt: row.updated_at, title: row.title,
    prompts: padArray(parseArray<string>(row.prompts, []), emptyPrompts()),
    images: parseArray<StoredFile>(row.images, []),
    audio: padArray(parseArray<StoredFile | null>(row.audio, []), emptyFiles()),
    results: padArray(parseArray(row.results, []), emptyResults()),
    band: row.band, bandNote: row.band_note, status: row.status,
  };
}

function parseArray<T>(value: string, fallback: T[]): T[] {
  try { const data = JSON.parse(value); return Array.isArray(data) ? data : fallback; } catch { return fallback; }
}

function padArray<T>(values: T[], defaults: T[]): T[] { return defaults.map((fallback, index) => values[index] ?? fallback); }

export async function saveAttempt(attempt: Attempt, ownerId: string) {
  const { db } = getBindings();
  attempt.updatedAt = new Date().toISOString();
  await db.prepare("UPDATE attempts SET updated_at = ?, title = ?, prompts = ?, images = ?, audio = ?, results = ?, band = ?, band_note = ?, status = ? WHERE id = ? AND owner_id = ?")
    .bind(attempt.updatedAt, attempt.title, JSON.stringify(attempt.prompts), JSON.stringify(attempt.images), JSON.stringify(attempt.audio), JSON.stringify(attempt.results), attempt.band, attempt.bandNote, attempt.status, attempt.id, ownerId).run();
}

export class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }
export function errorResponse(error: unknown) {
  if (error instanceof HttpError) return Response.json({ error: error.message }, { status: error.status });
  console.error("TOEFL site request failed", error);
  return Response.json({ error: "处理失败，请稍后重试。已完成的内容仍会保留。" }, { status: 500 });
}

export function responseText(data: Record<string, unknown>): string {
  if (typeof data.output_text === "string") return data.output_text;
  const output = Array.isArray(data.output) ? data.output : [];
  return output.flatMap((item) => {
    const obj = item as { content?: { type?: string; text?: string }[] };
    return Array.isArray(obj.content) ? obj.content.filter((part) => part.type === "output_text").map((part) => part.text ?? "") : [];
  }).join("\n");
}

export function parseModelJson(text: string): Record<string, unknown> {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try { const value = JSON.parse(cleaned); if (value && typeof value === "object" && !Array.isArray(value)) return value; } catch { /* handled below */ }
  throw new HttpError(502, "评分服务返回了无法读取的结果，请重试这一题。");
}

export function base64(bytes: Uint8Array) {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 32768) binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
  return btoa(binary);
}
