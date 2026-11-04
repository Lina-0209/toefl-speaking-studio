"use client";

import { useEffect, useState } from "react";
import { AudioLines, BookOpenText, CheckCircle2, ChevronRight, FileImage, History, LockKeyhole, Mic2, Settings2, RotateCcw, Sparkles, Trash2, UploadCloud } from "lucide-react";
import type { Attempt } from "../lib/attempt";
import Tutorial from "./tutorial";
import Materials from "./materials";

type Summary = { id: string; createdAt: string; title: string; status: string; band: number | null; completed: number };
type Stage = "upload" | "review" | "report";
type Models = { text: string; audio: string; answer: string };
const defaultModels: Models = { text: "gpt-4o", audio: "gpt-audio-1.5", answer: "gpt-6.1-sol" };

async function api<T>(path: string, method = "GET", body?: BodyInit | object): Promise<T> {
  const init: RequestInit = { method, cache: "no-store" };
  if (body instanceof FormData) init.body = body;
  else if (body !== undefined) { init.headers = { "Content-Type": "application/json" }; init.body = JSON.stringify(body); }
  const response = await fetch(`/api/attempts${path}`, init);
  const data = await response.json() as { error?: string };
  if (!response.ok) throw new Error(data.error || "请求失败，请重试。");
  return data as T;
}

async function uploadFile(id: string, kind: "image" | "audio", slot: number, file: File): Promise<Attempt> {
  const uploadId = crypto.randomUUID();
  const chunkSize = 400 * 1024;
  const chunks = Math.ceil(file.size / chunkSize);
  for (let index = 0; index < chunks; index++) {
    const response = await fetch(`/api/attempts/${id}/uploads/${kind}/${slot}/${uploadId}/${index}`, {
      method: "POST", body: file.slice(index * chunkSize, Math.min(file.size, (index + 1) * chunkSize)),
      headers: { "Content-Type": "application/octet-stream" },
    });
    if (!response.ok) { const message = await response.json().catch(() => ({})) as { error?: string }; throw new Error(message.error || "文件上传失败，请重试。"); }
  }
  const data = await api<{ attempt: Attempt }>(`/${id}/uploads/${kind}/${slot}/${uploadId}/complete`, "POST", { name: file.name, type: file.type, size: file.size, chunks });
  return data.attempt;
}

function guessedSlot(name: string): number | null {
  const match = name.toLowerCase().match(/(repeat|interview)[-_ ]?q?([1-7])/);
  if (!match) return null;
  const number = Number(match[2]);
  return match[1] === "repeat" ? number : number <= 4 ? number + 7 : null;
}

async function m4aToWav(file: File): Promise<File> {
  if (!/\.m4a$/i.test(file.name) && file.type !== "audio/mp4" && file.type !== "audio/x-m4a") return file;
  const context = new AudioContext();
  try {
    const audio = await context.decodeAudioData(await file.arrayBuffer());
    const rate = audio.sampleRate; const samples = audio.length;
    const output = new ArrayBuffer(44 + samples * 2); const view = new DataView(output);
    const str = (at: number, value: string) => { for (let i = 0; i < value.length; i++) view.setUint8(at + i, value.charCodeAt(i)); };
    str(0, "RIFF"); view.setUint32(4, 36 + samples * 2, true); str(8, "WAVE"); str(12, "fmt "); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true); str(36, "data"); view.setUint32(40, samples * 2, true);
    for (let i = 0; i < samples; i++) { let sample = 0; for (let c = 0; c < audio.numberOfChannels; c++) sample += audio.getChannelData(c)[i] / audio.numberOfChannels; view.setInt16(44 + i * 2, Math.max(-1, Math.min(1, sample)) * 32767, true); }
    return new File([output], file.name.replace(/\.m4a$/i, "") + ".wav", { type: "audio/wav" });
  } finally { await context.close(); }
}

export default function Home({ displayName }: { displayName: string }) {
  const [tab, setTab] = useState<"new" | "history" | "settings" | "tutorial" | "materials">("new");
  const [stage, setStage] = useState<Stage>("upload");
  const [images, setImages] = useState<File[]>([]);
  const [practiceTitle, setPracticeTitle] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [slots, setSlots] = useState<number[]>(Array(11).fill(-1));
  const [prompts, setPrompts] = useState<string[]>(Array(11).fill(""));
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [history, setHistory] = useState<Summary[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [providerKey, setProviderKey] = useState("");
  const [models, setModels] = useState<Models>(defaultModels);
  const [providerConfigured, setProviderConfigured] = useState(false);

  function addImages(incoming: File[]) {
    const supported = incoming.filter((file) => ["image/png", "image/jpeg", "image/webp"].includes(file.type));
    if (!supported.length) { setError("剪贴板中没有 PNG、JPG 或 WEBP 图片。"); return; }
    if (images.length + supported.length > 4) { setError("题目截图最多 4 张，请先移除不需要的图片。"); return; }
    setImages([...images, ...supported.map((file, index) => new File([file], file.name && !/^image\./i.test(file.name) ? file.name : `剪贴板截图-${Date.now()}-${index + 1}.${file.type === "image/jpeg" ? "jpg" : file.type.split("/")[1]}`, { type: file.type }))]);
    setError(""); setNotice(`已添加 ${supported.length} 张题目截图。`);
  }

  useEffect(() => {
    if (tab !== "new" || stage !== "upload") return;
    function handlePaste(event: ClipboardEvent) {
      const target = event.target;
      if (target instanceof HTMLElement && target.closest("input, textarea, [contenteditable='true']")) return;
      const pasted = Array.from(event.clipboardData?.items ?? []).filter((item) => item.kind === "file" && item.type.startsWith("image/")).map((item) => item.getAsFile()).filter((file): file is File => !!file);
      if (!pasted.length) return;
      event.preventDefault(); addImages(pasted);
    }
    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, [tab, stage, images]);

  async function refreshHistory() {
    try { const data = await api<{ attempts: Summary[] }>(""); setHistory(data.attempts); } catch { /* Site may be loading. */ }
  }
  useEffect(() => { void refreshHistory(); void refreshSettings(); }, []);

  async function refreshSettings() {
    try { const response = await fetch("/api/settings", { cache: "no-store" }); const data = await response.json() as { configured?: boolean; models?: Models }; if (response.ok) { setProviderConfigured(!!data.configured); if (data.models) setModels(data.models); } } catch { /* Settings remain editable. */ }
  }

  async function saveSettings() {
    setBusy(true); setError(""); setNotice("");
    try { const response = await fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...(providerKey.trim() ? { key: providerKey } : {}), models }) }); const data = await response.json() as { error?: string }; if (!response.ok) throw new Error(data.error || "保存失败"); setProviderKey(""); setProviderConfigured(true); setNotice("ztoken 密钥已加密保存。现在可以上传题目并开始评分。"); } catch (cause) { setError((cause as Error).message); } finally { setBusy(false); }
  }

  useEffect(() => {
    type ModelContext = { registerTool: (tool: { name: string; title: string; description: string; inputSchema: object; annotations: { readOnlyHint: boolean; untrustedContentHint: boolean }; execute: (input: unknown) => Promise<unknown> }, options: { signal: AbortSignal }) => void | Promise<void> };
    const context = (document as Document & { modelContext?: ModelContext }).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    void Promise.resolve(context.registerTool({
      name: "open_saved_speaking_attempt",
      title: "查看口语练习记录",
      description: "按记录 ID 打开当前用户已保存的新托福口语练习报告。",
      inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"], additionalProperties: false },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      async execute(input) {
        const id = (input as { id?: unknown })?.id;
        if (typeof id !== "string" || !history.some((item) => item.id === id)) throw new Error("找不到该练习记录。");
        await openAttempt(id);
        return { id, opened: true };
      },
    }, { signal: lifecycle.signal })).catch(() => { /* Browser may not support WebMCP. */ });
    return () => lifecycle.abort();
  }, [history]);

  function chooseFiles(selected: File[]) {
    const next = Array(11).fill(-1) as number[]; const used = new Set<number>();
    selected.forEach((file, index) => { const slot = guessedSlot(file.name); if (slot && next[slot - 1] === -1) { next[slot - 1] = index; used.add(index); } });
    let cursor = 0;
    for (let slot = 0; slot < 11; slot++) if (next[slot] === -1) { while (used.has(cursor)) cursor++; if (cursor < selected.length) { next[slot] = cursor; used.add(cursor); } }
    setFiles(selected); setSlots(next);
  }

  async function prepare() {
    if (!images.length) { setError("请先上传题目截图。"); return; }
    if (images.length > 4) { setError("题目截图最多上传 4 张。"); return; }
    setBusy(true); setError(""); setNotice("");
    try {
      setProgress("创建练习记录…");
      const created = await api<{ attempt: Attempt }>("", "POST", { title: practiceTitle.trim() }); let current = created.attempt;
      for (let i = 0; i < images.length; i++) {
        setProgress(`上传题目图片 ${i + 1}/${images.length}…`);
        current = await uploadFile(current.id, "image", i, images[i]);
      }
      setAttempt(current); setPrompts(current.prompts); setStage("review");
      try {
        setProgress("识别题目文字…");
        current = (await api<{ attempt: Attempt }>(`/${current.id}/extract`, "POST")).attempt;
        setAttempt(current); setPrompts(current.prompts);
      } catch (ocrError) { setNotice(`自动识别未完成：${(ocrError as Error).message} 请在下方手动填写题目。`); }
      await refreshHistory();
    } catch (cause) { setError((cause as Error).message); } finally { setBusy(false); setProgress(""); }
  }

  async function grade() {
    if (!attempt) return;
    if (prompts.some((prompt) => !prompt.trim())) { setError("请补全并确认全部 11 道题目。"); return; }
    const chosen = slots.filter((slot) => slot >= 0);
    if (new Set(chosen).size !== chosen.length) { setError("同一段录音不能分配给多道题，请检查题号对应关系。"); return; }
    if (Array.from({ length: 11 }, (_, i) => !attempt.audio[i] && slots[i] < 0).some(Boolean)) { setError("请为每道题选择一段回答录音。"); return; }
    setBusy(true); setError(""); setNotice(""); let current = attempt;
    try {
      setProgress("保存已确认的题目…");
      current = (await api<{ attempt: Attempt }>(`/${current.id}/prompts`, "PUT", { prompts })).attempt; setAttempt(current);
      for (let i = 0; i < 11; i++) {
        if (slots[i] < 0) continue;
        setProgress(`上传回答录音 ${i + 1}/11…`);
        const converted = await m4aToWav(files[slots[i]]);
        current = await uploadFile(current.id, "audio", i + 1, converted); setAttempt(current);
      }
      setFiles([]); setSlots(Array(11).fill(-1));
      setStage("report");
      for (let i = 0; i < 11; i++) {
        if (current.results[i]) continue;
        setProgress(`正在评分第 ${i + 1}/11 题…`);
        current = (await api<{ attempt: Attempt }>(`/${current.id}/score/${i + 1}`, "POST")).attempt; setAttempt(current);
      }
      setProgress("正在生成口语预估分…");
      current = (await api<{ attempt: Attempt }>(`/${current.id}/finalize`, "POST")).attempt; setAttempt(current);
      const answerFailures: number[] = [];
      for (let number = 8; number <= 11; number++) {
        if (!current.results[number - 1] || current.results[number - 1]?.recommendedAnswer) continue;
        setProgress(`正在生成第 ${number} 题推荐回答…`);
        try { current = (await api<{ attempt: Attempt }>(`/${current.id}/answer/${number}`, "POST")).attempt; setAttempt(current); }
        catch { answerFailures.push(number); }
      }
      if (answerFailures.length) setNotice(`第 ${answerFailures.join("、")} 题的推荐回答未生成；逐题评分已保存，可在报告中单独重试。`);
      await refreshHistory();
    } catch (cause) { setError((cause as Error).message); setNotice("已完成的题目已保存。你可以稍后重试未完成的题目。"); }
    finally { setBusy(false); setProgress(""); }
  }

  async function retryItem(number: number) {
    if (!attempt) return;
    setBusy(true); setError(""); setProgress(`重试第 ${number} 题…`);
    try {
      let current = (await api<{ attempt: Attempt }>(`/${attempt.id}/score/${number}`, "POST")).attempt; setAttempt(current);
      if (current.results.every(Boolean) && current.band == null) { setProgress("重新生成口语预估分…"); current = (await api<{ attempt: Attempt }>(`/${current.id}/finalize`, "POST")).attempt; setAttempt(current); }
      if (number >= 8 && !current.results[number - 1]?.recommendedAnswer) {
        setProgress(`正在生成第 ${number} 题推荐回答…`);
        current = (await api<{ attempt: Attempt }>(`/${current.id}/answer/${number}`, "POST")).attempt; setAttempt(current);
      }
      await refreshHistory();
    } catch (cause) { setError((cause as Error).message); } finally { setBusy(false); setProgress(""); }
  }

  async function generateAnswer(number: number) {
    if (!attempt) return;
    setBusy(true); setError(""); setProgress(`正在生成第 ${number} 题推荐回答…`);
    try { const current = (await api<{ attempt: Attempt }>(`/${attempt.id}/answer/${number}`, "POST")).attempt; setAttempt(current); }
    catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); setProgress(""); }
  }

  async function openAttempt(id: string) {
    setError(""); setBusy(true);
    try { const current = (await api<{ attempt: Attempt }>(`/${id}`)).attempt; setAttempt(current); setPracticeTitle(current.title); setPrompts(current.prompts); setImages([]); setFiles([]); setSlots(Array(11).fill(-1)); setStage(current.status === "draft" || current.status === "review" ? "review" : "report"); setTab("new"); }
    catch (cause) { setError((cause as Error).message); } finally { setBusy(false); }
  }

  async function deleteAttempt(id: string) {
    if (!window.confirm("删除这次练习及其题目图片、回答录音和报告？此操作无法撤销。")) return;
    setBusy(true); setError("");
    try { await api(`/${id}`, "DELETE"); if (attempt?.id === id) { setAttempt(null); setStage("upload"); } await refreshHistory(); }
    catch (cause) { setError((cause as Error).message); } finally { setBusy(false); }
  }

  function reset() { setTab("new"); setStage("upload"); setAttempt(null); setPracticeTitle(""); setPrompts(Array(11).fill("")); setImages([]); setFiles([]); setSlots(Array(11).fill(-1)); setError(""); setNotice(""); }
  const raw = attempt?.results.reduce((sum, result) => sum + (result?.score ?? 0), 0) ?? 0;
  const completed = attempt?.results.filter(Boolean).length ?? 0;

  return <main className="app-shell"><header className="topbar"><div className="brand"><span className="brand-mark"><AudioLines size={21}/></span><span><strong>声分</strong><small>TOEFL Speaking Studio</small></span></div><div className="topbar-right"><span className="private-pill"><LockKeyhole size={13}/> 我的练习空间</span><span className="avatar" title={displayName}>{displayName.trim().slice(0, 1).toUpperCase() || "U"}</span><a className="signout-link" href="/signout-with-chatgpt?return_to=%2F" target="_top">退出</a></div></header>
    <div className="workspace"><aside className="sidebar"><div className="sidebar-label">工作台</div><button className={`nav-item ${tab === "new" ? "active" : ""}`} onClick={reset}><Sparkles size={18}/> 新建评分 <ChevronRight size={15} className="nav-arrow"/></button><button className={`nav-item ${tab === "history" ? "active" : ""}`} onClick={() => { setTab("history"); void refreshHistory(); }}><History size={18}/> 历史记录</button><button className={`nav-item ${tab === "settings" ? "active" : ""}`} onClick={() => { setTab("settings"); setError(""); setNotice(""); void refreshSettings(); }}><Settings2 size={18}/> API 设置</button><button className={`nav-item ${tab === "materials" ? "active" : ""}`} disabled={busy} onClick={() => { setTab("materials"); setError(""); setNotice(""); }}><BookOpenText size={18}/> 我的素材</button><button className={`nav-item ${tab === "tutorial" ? "active" : ""}`} disabled={busy} onClick={() => { setTab("tutorial"); setError(""); setNotice(""); }}><BookOpenText size={18}/> 新手教程</button><div className="sidebar-guide"><BookOpenText size={19}/><strong>2026 新托福口语</strong><p>7 道场景复述 + 4 道模拟面试，逐题 0–5 分。</p><a href="https://www.ets.org/content/dam/ets-org/pdfs/toefl/speaking-rubrics.pdf" target="_blank" rel="noreferrer">查看 ETS 评分细则 ↗</a></div></aside>
      <section className="content"><div className="eyebrow">SPEAKING PRACTICE / 口语练习</div><h1>{tab === "materials" ? "我的素材" : tab === "tutorial" ? "新手教程" : tab === "history" ? "历史练习" : tab === "settings" ? "API 设置" : stage === "upload" ? "开始一次口语评分" : stage === "review" ? "核对题目与录音" : "口语评分报告"}</h1>{tab === "new" && stage !== "upload" && attempt && <p className="attempt-title">{attempt.title}</p>}<p className="lead">{tab === "materials" ? "直接使用作者共享素材，也可保存自己的 12 个核心短语和例子。" : tab === "tutorial" ? "从准备材料到查看报告，了解每一步怎么操作。" : tab === "history" ? "回顾每一次练习中的分数、录音与改进建议。" : tab === "settings" ? "使用你的 ztoken API 密钥调用评分模型。" : stage === "upload" ? "上传题目与回答录音，确认对应关系后获得逐题反馈和口语预估分。" : stage === "review" ? "自动识别可能有误，请确认原题和每段回答的题号。" : "逐题查看得分依据，回听录音并针对薄弱点练习。评分参考了 ETS 同题型 3、4、5 分音频样例。"}</p>
        {error && <div className="message error" role="alert">{error}</div>}{notice && <div className="message notice">{notice}</div>}{busy && <div className="message working" role="status"><span className="pulse-dot"/>{progress || "正在处理…"}</div>}
        {tab === "materials" ? <Materials/> : tab === "tutorial" ? <Tutorial configured={providerConfigured} onPractice={() => setTab("new")} onSettings={() => { setTab("settings"); void refreshSettings(); }} onHistory={() => { setTab("history"); void refreshHistory(); }}/> : tab === "settings" ? <section className="panel settings-panel"><div className="panel-heading"><span className="icon-tile mint"><LockKeyhole size={21}/></span><div><h2>ztoken 连接</h2><p>{providerConfigured ? "密钥已保存；输入新密钥可替换" : "尚未配置密钥"}</p></div></div><p>接口地址：<code>https://api.ztoken.pro/v1</code>。你的题目图片、回答录音和已背诵素材会发送给 ztoken 处理；请确认你接受其服务条款与数据处理方式。</p><label className="settings-field">ztoken API 密钥<input type="password" autoComplete="off" value={providerKey} onChange={(event) => setProviderKey(event.target.value)} placeholder={providerConfigured ? "留空以保留当前密钥" : "粘贴你的 API 密钥"}/></label><div className="settings-models"><p>模型名称（以你的 ztoken 账户实际支持的型号为准）</p>{([ ["text", "题目识别与总分预估"], ["audio", "直接听录音并逐题评分"], ["answer", "Interview 推荐回答"] ] as const).map(([field, label]) => <label className="settings-field" key={field}>{label}<input value={models[field]} onChange={(event) => setModels((current) => ({ ...current, [field]: event.target.value }))}/></label>)}</div><p className="panel-note">模型是否可用会在首次调用时由 ztoken 验证。逐题评分会同时提交 3 段 ETS 参考录音及你的录音，API 用量会增加；需要支持多段音频输入并直接输出文字评分的模型。推荐回答默认使用 gpt-6.1-sol；若你的 ztoken 账户不支持，可修改其模型名称。实际费用以 ztoken 的价格为准。</p><div className="action-row"><button className="primary-button" disabled={busy || (!providerConfigured && !providerKey.trim())} onClick={() => void saveSettings()}>保存 API 设置</button></div></section> : tab === "history" ? <div className="history-list">{history.length ? history.map((item) => <article className="history-card" key={item.id}><div className="history-date">{new Date(item.createdAt).toLocaleString("zh-CN")}</div><strong>{item.title}</strong><p>已评分 {item.completed}/11 题 · {item.band == null ? "尚无口语预估分" : `练习预估分 ${item.band.toFixed(1)} / 6`}</p><div className="history-actions"><button onClick={() => void openAttempt(item.id)}>查看练习 <ChevronRight size={15}/></button><button className="danger-link" onClick={() => void deleteAttempt(item.id)}><Trash2 size={15}/> 删除</button></div></article>) : <div className="empty-history"><History size={28}/><strong>还没有练习记录</strong><p>完成一次口语评分后，可以随时回看录音和分析报告。</p><button onClick={reset}>开始练习 <ChevronRight size={16}/></button></div>}</div> : <>
          <div className="steps"><span className={stage === "upload" ? "current" : "done"}><b>01</b> 上传材料</span><i/><span className={stage === "review" ? "current" : stage === "report" ? "done" : ""}><b>02</b> 核对题目</span><i/><span className={stage === "report" ? "current" : ""}><b>03</b> 查看报告</span></div>
          {stage === "upload" && <><label className="practice-name">此次练习名称<input type="text" maxLength={100} value={practiceTitle} onChange={(event) => setPracticeTitle(event.target.value)} placeholder="例如：新托福真题 01 · 第一次练习"/><small>可留空，系统会自动按日期命名。</small></label><div className="panel-grid"><section className="panel"><div className="panel-heading"><span className="icon-tile lilac"><FileImage size={21}/></span><div><h2>题目截图</h2><p>上传表格截图，也可附上场景图片</p></div></div><label className="dropzone"><UploadCloud size={28}/><strong>选择题目图片</strong><span>也可在此页面按 ⌘V / Ctrl+V 粘贴截图</span><small>PNG、JPG 或 WEBP · 最多 4 张</small><input type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={(event) => { addImages(Array.from(event.target.files ?? [])); event.target.value = ""; }}/></label>{images.length ? <div className="image-list">{images.map((file, index) => <div className="image-entry" key={`${file.name}-${index}`}><FileImage size={15}/><span>{file.name}</span><button type="button" aria-label={`移除 ${file.name}`} onClick={() => setImages((current) => current.filter((_, slot) => slot !== index))}>移除</button></div>)}</div> : <p className="panel-note">系统会识别 11 道题目；评分前可修改文字。</p>}</section><section className="panel"><div className="panel-heading"><span className="icon-tile mint"><Mic2 size={21}/></span><div><h2>回答录音</h2><p>将每段录音放入对应的题号</p></div></div><label className="dropzone"><UploadCloud size={28}/><strong>选择回答录音</strong><span>WAV、MP3 或 M4A · 共 11 段</span><input type="file" accept=".wav,.mp3,.m4a,audio/wav,audio/mpeg,audio/mp4" multiple onChange={(event) => chooseFiles(Array.from(event.target.files ?? []))}/></label><p className="panel-note">{files.length ? `已选择 ${files.length} 段录音，下一步可核对题号。` : "可一次上传全部文件，再逐一核对题号。"}</p></section></div><div className="action-row"><button className="primary-button" onClick={() => void prepare()} disabled={busy}>上传并识别题目 <ChevronRight size={16}/></button></div><div className="sample-header"><div><h2>评分流程</h2><p>根据两种不同题型的 ETS 细则分析</p></div><span className="outline-pill">11 道题 · 约 8 分钟</span></div><div className="task-row"><span className="task-number">01–07</span><span className="task-icon"><AudioLines size={18}/></span><div><strong>Listen and Repeat</strong><p>比较复述内容与原句，分析准确度和可理解度</p></div><span className="score-tag">每题 0–5 分</span></div><div className="task-row"><span className="task-number">08–11</span><span className="task-icon"><Mic2 size={18}/></span><div><strong>Take an Interview</strong><p>分析内容展开、语速、发音、语法和词汇，并生成复用背诵素材的推荐回答</p></div><span className="score-tag">每题 0–5 分</span></div></>}
          {stage === "review" && <><div className="review-intro"><CheckCircle2 size={18}/><span>请核对题目文字，并为每题选择正确的回答录音。缺失或识别错误的文字可直接编辑。</span></div><div className="question-list">{Array.from({ length: 11 }, (_, index) => <article className="question-card" key={index}><div className="question-label"><span>第 {index + 1} 题</span><small>{index < 7 ? "场景复述" : "模拟面试"}</small></div><textarea aria-label={`第 ${index + 1} 题题目`} value={prompts[index] ?? ""} rows={index < 7 ? 2 : 3} placeholder={index < 7 ? "请输入需要复述的英文原句" : "请输入英文面试问题"} onChange={(event) => setPrompts((current) => current.map((value, slot) => slot === index ? event.target.value : value))}/><div className="assignment"><Mic2 size={15}/><select aria-label={`第 ${index + 1} 题回答录音`} value={slots[index]} onChange={(event) => setSlots((current) => current.map((value, slot) => slot === index ? Number(event.target.value) : value))}><option value={-1}>{attempt?.audio[index]?.name || "选择回答录音"}</option>{files.map((file, fileIndex) => <option value={fileIndex} key={`${file.name}-${fileIndex}`}>{file.name}</option>)}</select>{attempt?.audio[index] && <span className="saved-pill">已上传</span>}</div></article>)}</div><div className="action-row"><button className="primary-button" disabled={busy} onClick={() => void grade()}>确认并开始评分 <ChevronRight size={16}/></button><button className="quiet-button" onClick={reset} disabled={busy}>重新开始</button></div></>}
          {stage === "report" && attempt && <><div className="result-hero"><div><span className="result-kicker">SPEAKING ESTIMATE</span><h2>{attempt.band == null ? "评分进行中" : `${attempt.band.toFixed(1)} / 6`}</h2><p>{attempt.band == null ? `已完成 ${completed}/11 题；全部完成后显示口语预估分。` : "口语单项练习预估分 · 非 ETS 正式成绩"}</p></div><div className="raw-box"><span>逐题原始分</span><strong>{raw}<small> / 55</small></strong></div></div>{attempt.bandNote && <div className="band-note">{attempt.bandNote}</div>}{attempt.results.some((result) => !result) && !busy && <div className="action-row"><button className="quiet-button" onClick={() => setStage("review")}>检查未完成题目的录音</button></div>}<div className="report-list">{Array.from({ length: 11 }, (_, index) => { const result = attempt.results[index]; return <article className="report-card" key={index}><div className="report-head"><div><span className="report-number">{String(index + 1).padStart(2, "0")}</span><span className="report-type">{index < 7 ? "Listen and Repeat" : "Take an Interview"}</span></div><strong className={result ? "item-score" : "pending-score"}>{result ? `${result.score} / 5` : "待评分"}</strong></div><p className="prompt-text">{attempt.prompts[index]}</p>{attempt.audio[index] && <audio controls preload="none" src={`/api/attempts/${attempt.id}/files/audio/${index + 1}`} aria-label={`第 ${index + 1} 题回答录音`}/>}{result ? <><div className="analysis-grid"><div><span>音频模型听写（仅供参考）</span><p>{result.transcript || "未能可靠转写"}</p></div><div><span>评分依据</span><p>{result.reason}</p></div></div><div className="advice"><Sparkles size={16}/><span>{result.advice}</span></div>{index >= 7 && <div className="recommendation"><div className="recommendation-heading"><strong>推荐回答 · 基于原回答优化</strong><button type="button" onClick={() => void generateAnswer(index + 1)} disabled={busy}>{result.recommendedAnswer ? "重新生成" : "生成推荐回答"}</button></div>{result.recommendedAnswer ? <><p className="recommendation-answer">{result.recommendedAnswer}</p>{result.optimizationNote && <p className="recommendation-note">优化说明：{result.optimizationNote}</p>}{result.selectedReasons?.length ? <div className="recommendation-reasons"><strong>本题选用的两个核心短语</strong><ul>{result.selectedReasons.map((reason) => <li key={reason.id}><b>{reason.theme}</b><span>{reason.sentence}</span>{reason.usedPhrase && <small>答案复用：{reason.usedPhrase}</small>}</li>)}</ul></div> : null}{result.reasonNote && <p className="recommendation-note">{result.reasonNote}</p>}{result.materialIds?.length ? <p className="recommendation-reuse">举例素材：{result.materialIds.join("、")}</p> : null}{result.reusedPhrases?.length ? <p className="recommendation-reuse">复用表达：{result.reusedPhrases.join("；")}</p> : null}{result.reuseNote && <p className="recommendation-note">{result.reuseNote}</p>}{result.answerModel && <p className="recommendation-note">生成模型：{result.answerModel}</p>}</> : <p className="recommendation-empty">评分已保存，可单独生成这一题的推荐回答。</p>}</div>}</> : <div className="retry-row"><span>这道题尚未完成评分。</span>{attempt.audio[index] && <button onClick={() => void retryItem(index + 1)} disabled={busy}><RotateCcw size={14}/> 重试本题</button>}</div>}</article>; })}</div>{completed === 11 && attempt.band == null && !busy && <button className="primary-button" onClick={async () => { setBusy(true); setError(""); try { const data = await api<{ attempt: Attempt }>(`/${attempt.id}/finalize`, "POST"); setAttempt(data.attempt); await refreshHistory(); } catch (cause) { setError((cause as Error).message); } finally { setBusy(false); } }}>重新生成口语预估分</button>}</>}
          <div className="hint-bar">逐题评分参考 <a href="https://www.ets.org/content/dam/ets-org/pdfs/toefl/speaking-performance-levels.pdf" target="_blank" rel="noreferrer">ETS 3、4、5 分录音样例 ↗</a>，仍依据官方细则独立评定 0–5 分。口语总分为 <strong>1–6 分练习预估分</strong>，与 ETS 正式成绩不同。<a href="https://www.ets.org/toefl/test-takers/ibt/scores/understand-scores.html" target="_blank" rel="noreferrer">了解官方成绩 ↗</a></div>
        </>}
      </section></div>
  </main>;
}
