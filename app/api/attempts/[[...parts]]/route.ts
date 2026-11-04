import { Attempt, ITEM_COUNT, StoredFile, emptyFiles, emptyPrompts, emptyResults } from "../../../../lib/attempt";
import { estimateBand, extractPrompts, scoreItem } from "../../../../lib/evaluate";
import { recommendAnswer } from "../../../../lib/recommend";
import { assertSameOrigin, errorResponse, getBindings, getOwnedAttempt, HttpError, requireOwner, saveAttempt, toAttempt } from "../../../../lib/server";

export const dynamic = "force-dynamic";

function pathParts(request: Request) {
  const path = new URL(request.url).pathname;
  const suffix = path.replace(/^\/api\/attempts\/?/, "");
  return suffix ? suffix.split("/").map(decodeURIComponent) : [];
}

function numberPart(value: string | undefined) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1 || number > ITEM_COUNT) throw new HttpError(400, "题号必须为 1–11。");
  return number;
}

function assertFile(value: FormDataEntryValue | null): File {
  if (!(value instanceof File)) throw new HttpError(400, "请选择文件后重试。");
  return value;
}

async function fileBytes(file: File, maxBytes: number) {
  if (file.size < 1 || file.size > maxBytes) throw new HttpError(400, `文件大小必须在 0–${Math.round(maxBytes / 1024 / 1024)} MB 之间。`);
  return new Uint8Array(await file.arrayBuffer());
}

async function loadAttempt(id: string, ownerId: string) { return toAttempt(await getOwnedAttempt(id, ownerId)); }
function safeName(name: string) { return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80) || "upload"; }

export async function GET(request: Request) {
  try {
    const ownerId = await requireOwner();
    const parts = pathParts(request);
    const { db, bucket } = getBindings();
    if (parts.length === 0) {
      const rows = await db.prepare("SELECT id, created_at, updated_at, title, status, band, results FROM attempts WHERE owner_id = ? ORDER BY created_at DESC LIMIT 100").bind(ownerId).all<{ id: string; created_at: string; updated_at: string; title: string; status: string; band: number | null; results: string }>();
      return Response.json({ attempts: rows.results.map((row) => ({ id: row.id, createdAt: row.created_at, updatedAt: row.updated_at, title: row.title, status: row.status, band: row.band, completed: (JSON.parse(row.results) as unknown[]).filter(Boolean).length })) });
    }
    const attempt = await loadAttempt(parts[0], ownerId);
    if (parts[1] === "files" && parts.length === 4) {
      const index = Number(parts[3]);
      const file = parts[2] === "image" ? attempt.images[index] : parts[2] === "audio" ? attempt.audio[index - 1] : null;
      if (!file) throw new HttpError(404, "文件不存在。");
      const object = await bucket.get(file.key);
      if (!object) throw new HttpError(404, "文件不存在。");
      return new Response(object.body, { headers: { "Content-Type": file.type, "Cache-Control": "private, no-store", "Content-Disposition": `inline; filename="${safeName(file.name)}"` } });
    }
    if (parts.length === 1) return Response.json({ attempt });
    throw new HttpError(404, "找不到请求的内容。");
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const ownerId = await requireOwner();
    const parts = pathParts(request);
    const { db, bucket } = getBindings();
    if (parts.length === 0) {
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      const body = await request.json().catch(() => ({})) as { title?: unknown };
      if (body.title !== undefined && typeof body.title !== "string") throw new HttpError(400, "练习名称格式不正确。");
      const customTitle = typeof body.title === "string" ? body.title.trim() : "";
      if (customTitle.length > 100) throw new HttpError(400, "练习名称不能超过 100 个字符。");
      const title = customTitle || `口语练习 · ${new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeZone: "Asia/Manila" }).format(new Date())}`;
      await db.prepare("INSERT INTO attempts (id, owner_id, created_at, updated_at, title, prompts, images, audio, results, band, band_note, status, version) VALUES (?, ?, ?, ?, ?, '[]', '[]', '[]', '[]', NULL, NULL, 'draft', 1)").bind(id, ownerId, now, now, title).run();
      return Response.json({ attempt: await loadAttempt(id, ownerId) }, { status: 201 });
    }
    const attempt = await loadAttempt(parts[0], ownerId);
    if (parts[1] === "uploads" && parts.length === 6) {
      const [, , kind, slotText, uploadId, action] = parts;
      const slot = Number(slotText);
      if (!/^[0-9a-f-]{36}$/i.test(uploadId) || !["image", "audio"].includes(kind) || !Number.isInteger(slot) || (kind === "image" && (slot < 0 || slot > 3)) || (kind === "audio" && (slot < 1 || slot > 11))) throw new HttpError(400, "上传参数无效。");
      const prefix = `attempts/${ownerId}/${attempt.id}/chunks/${uploadId}/`;
      if (action === "complete") {
        const data = await request.json() as { name?: unknown; type?: unknown; chunks?: unknown; size?: unknown };
        const count = Number(data.chunks); const size = Number(data.size);
        const max = kind === "image" ? 10 * 1024 * 1024 : 25 * 1024 * 1024;
        const type = data.type === "audio/x-wav" || data.type === "audio/wave" ? "audio/wav" : data.type;
        if (!Number.isInteger(count) || count < 1 || count > 64 || !Number.isInteger(size) || size < 1 || size > max || typeof data.name !== "string" || data.name.length > 200 || typeof type !== "string") throw new HttpError(400, "文件信息无效。");
        if (kind === "image" && !["image/png", "image/jpeg", "image/webp"].includes(type)) throw new HttpError(400, "图片格式不支持。");
        if (kind === "audio" && !["audio/wav", "audio/mpeg"].includes(type)) throw new HttpError(400, "录音格式不支持。");
        if (kind === "image" && attempt.images.length >= 4) throw new HttpError(400, "最多上传 4 张题目图片。");
        const assembled = new Uint8Array(size); let cursor = 0; const chunkKeys: string[] = [];
        for (let index = 0; index < count; index++) {
          const key = prefix + index; const object = await bucket.get(key);
          if (!object) throw new HttpError(400, `缺少第 ${index + 1} 个文件分块，请重试上传。`);
          const chunk = new Uint8Array(await object.arrayBuffer());
          if (cursor + chunk.byteLength > size) throw new HttpError(400, "上传文件大小不一致。");
          assembled.set(chunk, cursor); cursor += chunk.byteLength; chunkKeys.push(key);
        }
        if (cursor !== size) throw new HttpError(400, "上传文件不完整，请重试。");
        const key = `attempts/${ownerId}/${attempt.id}/${kind}/${slot}-${crypto.randomUUID()}`;
        await bucket.put(key, assembled, { httpMetadata: { contentType: type } });
        const file: StoredFile = { key, name: data.name, type, size };
        const old = kind === "audio" ? attempt.audio[slot - 1] : null;
        if (kind === "image") attempt.images.push(file);
        else { attempt.audio[slot - 1] = file; attempt.results[slot - 1] = null; attempt.band = null; attempt.bandNote = null; }
        attempt.status = "review"; await saveAttempt(attempt, ownerId);
        await bucket.delete(chunkKeys);
        if (old) await bucket.delete(old.key);
        return Response.json({ attempt });
      }
      const index = Number(action);
      if (!Number.isInteger(index) || index < 0 || index >= 64) throw new HttpError(400, "文件分块序号无效。");
      const bytes = new Uint8Array(await request.arrayBuffer());
      if (!bytes.byteLength || bytes.byteLength > 512 * 1024) throw new HttpError(400, "文件分块不得超过 512 KB。");
      await bucket.put(prefix + index, bytes);
      return Response.json({ ok: true });
    }
    if (parts[1] === "images" && parts.length === 2) {
      if (attempt.images.length >= 4) throw new HttpError(400, "最多上传 4 张题目图片。");
      const form = await request.formData(); const file = assertFile(form.get("file"));
      if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) throw new HttpError(400, "图片仅支持 PNG、JPG 或 WEBP。");
      const bytes = await fileBytes(file, 10 * 1024 * 1024);
      const key = `attempts/${ownerId}/${attempt.id}/images/${crypto.randomUUID()}`;
      await bucket.put(key, bytes, { httpMetadata: { contentType: file.type } });
      attempt.images.push({ key, name: file.name, type: file.type, size: file.size });
      await saveAttempt(attempt, ownerId);
      return Response.json({ attempt });
    }
    if (parts[1] === "extract" && parts.length === 2) {
      const files = await Promise.all(attempt.images.map(async (file) => {
        const object = await bucket.get(file.key); if (!object) throw new HttpError(404, "题目图片缺失，请重新上传。");
        return { bytes: new Uint8Array(await object.arrayBuffer()), type: file.type };
      }));
      const prompts = await extractPrompts(ownerId, files);
      attempt.prompts = prompts; attempt.status = "review";
      await saveAttempt(attempt, ownerId);
      return Response.json({ attempt });
    }
    if (parts[1] === "audio" && parts.length === 3) {
      const number = numberPart(parts[2]);
      const form = await request.formData(); const file = assertFile(form.get("file"));
      const type = file.type === "audio/x-wav" || file.type === "audio/wave" ? "audio/wav" : file.type;
      if (!["audio/wav", "audio/mpeg"].includes(type)) throw new HttpError(400, "录音仅支持 WAV 或 MP3；M4A 会在浏览器转换为 WAV 后上传。");
      const bytes = await fileBytes(file, 25 * 1024 * 1024);
      const old = attempt.audio[number - 1];
      const key = `attempts/${ownerId}/${attempt.id}/audio/${number}-${crypto.randomUUID()}`;
      await bucket.put(key, bytes, { httpMetadata: { contentType: type } });
      attempt.audio[number - 1] = { key, name: file.name, type, size: file.size };
      attempt.results[number - 1] = null; attempt.band = null; attempt.bandNote = null; attempt.status = "review";
      await saveAttempt(attempt, ownerId);
      if (old) await bucket.delete(old.key);
      return Response.json({ attempt });
    }
    if (parts[1] === "score" && parts.length === 3) {
      const number = numberPart(parts[2]);
      const prompt = attempt.prompts[number - 1]?.trim(); const file = attempt.audio[number - 1];
      if (!prompt || !file) throw new HttpError(400, "请先确认题目并上传对应录音。");
      if (attempt.results[number - 1]) return Response.json({ attempt });
      const object = await bucket.get(file.key);
      if (!object) throw new HttpError(404, "录音缺失，请重新上传。");
      const result = await scoreItem(ownerId, number, prompt, file, new Uint8Array(await object.arrayBuffer()));
      attempt.results[number - 1] = result; attempt.status = "scoring";
      await saveAttempt(attempt, ownerId);
      return Response.json({ attempt });
    }
    if (parts[1] === "answer" && parts.length === 3) {
      const number = numberPart(parts[2]);
      const recommendation = await recommendAnswer(ownerId, attempt, number);
      attempt.results[number - 1] = { ...attempt.results[number - 1]!, ...recommendation };
      await saveAttempt(attempt, ownerId);
      return Response.json({ attempt });
    }
    if (parts[1] === "finalize" && parts.length === 2) {
      if (attempt.results.length !== ITEM_COUNT || attempt.results.some((result) => !result)) throw new HttpError(400, "完成全部 11 题后才能生成总分。");
      const { band, note } = await estimateBand(ownerId, attempt);
      attempt.band = band; attempt.bandNote = note; attempt.status = "complete";
      await saveAttempt(attempt, ownerId);
      return Response.json({ attempt });
    }
    throw new HttpError(404, "找不到请求的内容。");
  } catch (error) { return errorResponse(error); }
}

export async function PUT(request: Request) {
  try {
    assertSameOrigin(request);
    const ownerId = await requireOwner();
    const parts = pathParts(request);
    if (parts.length !== 2 || parts[1] !== "prompts") throw new HttpError(404, "找不到请求的内容。");
    const attempt = await loadAttempt(parts[0], ownerId);
    const body = await request.json() as { prompts?: unknown; title?: unknown };
    if (!Array.isArray(body.prompts) || body.prompts.length !== ITEM_COUNT || body.prompts.some((prompt) => typeof prompt !== "string" || prompt.length > 2500)) throw new HttpError(400, "请填写 11 道题目，且每题不超过 2500 字。");
    const prompts = body.prompts.map((prompt: string) => prompt.trim());
    if (prompts.some((prompt) => !prompt)) throw new HttpError(400, "请补全 11 道题目后再确认。");
    if (JSON.stringify(attempt.prompts) !== JSON.stringify(prompts)) { attempt.results = emptyResults(); attempt.band = null; attempt.bandNote = null; }
    attempt.prompts = prompts; attempt.status = "review";
    if (typeof body.title === "string" && body.title.trim()) attempt.title = body.title.trim().slice(0, 100);
    await saveAttempt(attempt, ownerId);
    return Response.json({ attempt });
  } catch (error) { return errorResponse(error); }
}

export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request);
    const ownerId = await requireOwner(); const parts = pathParts(request);
    if (parts.length !== 1) throw new HttpError(404, "找不到请求的内容。");
    const attempt = await loadAttempt(parts[0], ownerId);
    const { db, bucket } = getBindings();
    const keys = [...attempt.images, ...attempt.audio.filter(Boolean) as StoredFile[]].map((file) => file.key);
    let cursor: string | undefined;
    do {
      const listing = await bucket.list({ prefix: `attempts/${ownerId}/${attempt.id}/chunks/`, cursor });
      keys.push(...listing.objects.map((object) => object.key));
      cursor = listing.truncated ? listing.cursor : undefined;
    } while (cursor);
    if (keys.length) await bucket.delete(keys);
    await db.prepare("DELETE FROM attempts WHERE id = ? AND owner_id = ?").bind(attempt.id, ownerId).run();
    return Response.json({ ok: true });
  } catch (error) { return errorResponse(error); }
}
