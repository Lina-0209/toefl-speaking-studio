import { unzipSync } from "fflate";
import { getBindings, HttpError } from "./server";

// ETS publishes six scored TPO responses for the updated TOEFL iBT.
export const ETS_SAMPLES_URL = "https://www.ets.org/content/dam/ets-org/pdfs/toefl/sample-responses-audio-files.zip";
export const ETS_SCORES_URL = "https://www.ets.org/content/dam/ets-org/pdfs/toefl/speaking-performance-levels.pdf";
const VERSION = "2026-05-29";
const FILENAMES = {
  repeat: ["Listen_Repeat - Response 1.mp3", "Listen_Repeat - Response 2.mp3", "Listen_Repeat - Response 3.mp3"],
  interview: ["Interview - Response 1.mp3", "Interview - Response 2.mp3", "Interview - Response 3.mp3"],
} as const;

export type ReferenceAudio = { score: 3 | 4 | 5; bytes: Uint8Array };

function key(type: "repeat" | "interview", score: number) { return `ets-speaking-references/${VERSION}/${type}-${score}.mp3`; }

export async function getReferenceAudio(type: "repeat" | "interview"): Promise<ReferenceAudio[]> {
  const { bucket } = getBindings();
  const scores = [3, 4, 5] as const;
  const cached = await Promise.all(scores.map((score) => bucket.get(key(type, score))));
  if (cached.every(Boolean)) return Promise.all(cached.map(async (object, index) => ({ score: scores[index], bytes: new Uint8Array(await object!.arrayBuffer()) })));

  let response: Response;
  try { response = await fetch(ETS_SAMPLES_URL, { signal: AbortSignal.timeout(60000) }); }
  catch { throw new HttpError(502, "无法获取 ETS 官方评分样例录音，请稍后重试本题。"); }
  if (!response.ok) throw new HttpError(502, "ETS 官方评分样例暂时无法下载，请稍后重试本题。");
  const archive = new Uint8Array(await response.arrayBuffer());
  if (archive.length > 10 * 1024 * 1024) throw new HttpError(502, "ETS 样例文件大小异常，已停止评分。");
  let files: Record<string, Uint8Array>;
  try { files = unzipSync(archive); }
  catch { throw new HttpError(502, "ETS 官方样例压缩包无法读取，请稍后重试本题。"); }
  const result = scores.map((score, index) => {
    const filename = FILENAMES[type][index];
    const entry = Object.entries(files).find(([path]) => path.endsWith(`/${filename}`));
    if (!entry || !entry[1].length || entry[1].length > 5 * 1024 * 1024) throw new HttpError(502, "ETS 官方样例录音缺失或异常，请稍后重试本题。");
    return { score, bytes: entry[1] };
  });
  await Promise.all(result.map((item) => bucket.put(key(type, item.score), item.bytes, { httpMetadata: { contentType: "audio/mpeg" } })));
  return result;
}
