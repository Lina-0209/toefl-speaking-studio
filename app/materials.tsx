"use client";

import { clientTranslate as t } from "../lib/language";
import { useLanguage } from "./language";

import { useEffect, useState } from "react";
import { unzipSync } from "fflate";
import { BookOpenText, Plus, Trash2, UploadCloud } from "lucide-react";
import { emptyMaterial, validateMaterial, type StudyMaterial } from "../lib/material";

async function request(method: string, body?: object) {
  const response = await fetch("/api/materials", { method, cache: "no-store", ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}) });
  const data = await response.json() as { material: StudyMaterial; source: "shared" | "personal"; error?: string };
  if (!response.ok) throw new Error(data.error || t("素材请求失败，请重试。"));
  return data;
}

export default function Materials() {
  const { t } = useLanguage();
  const [material, setMaterial] = useState<StudyMaterial>(emptyMaterial);
  const [source, setSource] = useState<"shared" | "personal">("shared");
  const [dirty, setDirty] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  async function refresh() { const data = await request("GET"); setMaterial(data.material); setSource(data.source); setDirty(false); }
  useEffect(() => { refresh().catch((e) => setError(e.message)).finally(() => setBusy(false)); }, []);
  function change(next: StudyMaterial) { setMaterial(next); setDirty(true); setNotice(""); }
  async function action(task: () => Promise<void>) {
    setBusy(true); setError(""); setNotice("");
    try { await task(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function readFile(file?: File) {
    if (!file) return;
    await action(async () => {
      if (file.size > 5 * 1024 * 1024) throw new Error(t("文件不能超过 5 MB。"));
      let content = "";
      if (/\.docx$/i.test(file.name)) {
        const files = unzipSync(new Uint8Array(await file.arrayBuffer()), { filter: (entry) => entry.name === "word/document.xml" && entry.originalSize < 2 * 1024 * 1024 });
        if (!files["word/document.xml"]) throw new Error(t("无法读取 Word 正文，请使用标准 DOCX 或粘贴文本。"));
        const xml = new DOMParser().parseFromString(new TextDecoder().decode(files["word/document.xml"]), "application/xml");
        if (xml.querySelector("parsererror")) throw new Error(t("Word 正文格式无法识别。"));
        content = Array.from(xml.getElementsByTagNameNS("*", "p")).map((p) => p.textContent ?? "").join("\n");
      } else if (/\.txt$/i.test(file.name)) content = await file.text();
      else throw new Error(t("请选择 DOCX 或 TXT 文件。"));
      if (content.length > 40000) throw new Error(t("素材超过 40000 字符，请先精简。"));
      setText(content); setNotice(t("已读取文本。点击「识别为可编辑素材」后才会调用你的 API；识别结果需核对并保存。"));
    });
  }
  return <div className="material-page">
    <section className="panel"><div className="panel-heading"><span className="icon-tile mint"><BookOpenText size={21}/></span><div><h2>{t("素材可选，直接练习也可以")}</h2><p>{t("当前使用：")}{source === "shared" ? t("作者共享素材") : t("我的个人素材")}{dirty ? t(" · 有未保存的编辑") : ""}</p></div></div><p className="material-intro">{t("默认使用作者共享的 12 个核心短语与举例素材，无需上传。你可以编辑下方内容，或导入自己的清单；保存后仅用于你自己的 Interview 推荐回答。删除个人素材后会恢复使用共享素材。")}</p><p className="material-intro">{t("推荐回答优先优化你的原回答，每题选两个核心短语；例子会优先沿用你的原回答。共享素材中的个人故事是练习范例，请按自己的真实经历调整。")}</p><button className="quiet-button" disabled={busy || source === "shared" && !dirty} onClick={() => { if (window.confirm(t("删除个人素材和当前编辑，恢复使用作者共享素材？"))) void action(async () => { await request("DELETE"); await refresh(); setNotice(t("已恢复使用作者共享素材。")); }); }}>{t("使用作者共享素材")}</button></section>
    {error && <div className="message error" role="alert">{t(error)}</div>}{notice && <div className="message notice" role="status">{t(notice)}</div>}
    <section className="panel"><h2>{t("导入自己的素材（可选）")}</h2><p className="material-intro">{t("读取 DOCX / TXT，或直接粘贴文本。点击识别会将文本发送至 ztoken，使用你在 API 设置中配置的文字模型并产生费用；不会自动保存。")}</p><label className="material-upload"><UploadCloud size={17}/>{t("选择 DOCX / TXT")}<input type="file" accept=".docx,.txt" disabled={busy} onChange={(e) => { void readFile(e.target.files?.[0]); e.target.value = ""; }}/></label><textarea aria-label={t("待识别的背诵素材")} rows={6} maxLength={40000} value={text} disabled={busy} onChange={(e) => setText(e.target.value)} placeholder={t("粘贴包含 12 个核心短语和可选例子的背诵清单")}/><button className="quiet-button" disabled={busy || text.trim().length < 20} onClick={() => void action(async () => { const data = await request("POST", { text }); change(data.material); setNotice(t("已识别，请核对下方 12 个核心短语和例子，再保存为个人素材。")); })}>{busy ? t("正在处理…") : t("识别为可编辑素材")}</button></section>
    <section className="panel"><h2>{t("12 个核心短语")}</h2><p className="material-intro">{t("每条填写主题与英文短语或句子，至少 3 个英文单词。每题会选择其中两个。")}</p><div className="material-reasons">{material.reasons.map((reason, index) => <div className="material-reason" key={index}><span>{String(index + 1).padStart(2, "0")}</span><label>{t("主题")}<input disabled={busy} maxLength={80} value={reason.theme} onChange={(e) => change({ ...material, reasons: material.reasons.map((r, i) => i === index ? { ...r, theme: e.target.value } : r) })}/></label><label>{t("英文核心短语")}<textarea rows={2} disabled={busy} maxLength={500} value={reason.sentence} onChange={(e) => change({ ...material, reasons: material.reasons.map((r, i) => i === index ? { ...r, sentence: e.target.value } : r) })}/></label></div>)}</div></section>
    <section className="panel"><h2>{t("举例素材（可选）")}</h2><p className="material-intro">{t("最多 14 条，每条不超过 2000 字符。仅在适合题目时作为补充例子。")}</p><div className="material-stories">{material.stories.map((story, index) => <label key={index}>{t("素材 {0}", index + 1)}<textarea rows={4} disabled={busy} maxLength={2000} value={story.text} onChange={(e) => change({ ...material, stories: material.stories.map((s, i) => i === index ? { ...s, text: e.target.value } : s) })}/><button className="tutorial-link" disabled={busy} onClick={() => change({ ...material, stories: material.stories.filter((_, i) => i !== index) })}><Trash2 size={14}/>{t("移除此例子")}</button></label>)}</div><button className="quiet-button" disabled={busy || material.stories.length >= 14} onClick={() => change({ ...material, stories: [...material.stories, { id: `S${material.stories.length + 1}`, text: "" }] })}><Plus size={15}/>{t("添加例子")}</button></section>
    <div className="action-row"><button className="primary-button" disabled={busy || !dirty} onClick={() => void action(async () => { const valid = validateMaterial(material); await request("PUT", valid); await refresh(); setNotice(t("个人素材已保存。之后生成的 Interview 推荐回答将使用它；已有答案需点击「重新生成」。")); window.scrollTo({ top: 0, behavior: "smooth" }); })}>{t("保存为我的个人素材")}</button><span className="material-save-note">{t("未保存时仍使用{0}。", source === "shared" ? t("作者共享素材") : t("上次保存的个人素材"))}</span></div>
  </div>;
}
