import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { createRequire } from "node:module";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";

const root = path.resolve(import.meta.dirname, "..");
const nativeRequire = createRequire(import.meta.url);
const origin = "https://studio.example";

// Run the real route/server modules against SQLite and an in-memory R2 adapter.
// Hosting's identity injection is stubbed; these tests cover app authorization.
function setup() {
  const sqlite = new DatabaseSync(":memory:");
  for (const file of readdirSync(path.join(root, "drizzle")).filter((f) => f.endsWith(".sql")).sort()) sqlite.exec(readFileSync(path.join(root, "drizzle", file), "utf8").replaceAll("--> statement-breakpoint", ""));
  const db = { prepare(sql) { return { bind(...values) {
    const statement = sqlite.prepare(sql);
    return {
      async first() { return statement.get(...values) ?? null; },
      async all() { return { results: statement.all(...values) }; },
      async run() { return statement.run(...values); },
    };
  } }; } };
  const files = new Map();
  const bucket = { async put(key, bytes) { files.set(key, bytes); }, async get(key) { return files.get(key) ?? null; }, async delete(keys) { for (const key of Array.isArray(keys) ? keys : [keys]) files.delete(key); }, async list({ prefix }) { return { objects: [...files.keys()].filter((key) => key.startsWith(prefix)).map((key) => ({ key })), truncated: false }; } };
  const env = { DB: db, BUCKET: bucket, ZTOKEN_ENCRYPTION_KEY: btoa("x".repeat(32)) };
  let user = "owner-a";
  const cache = new Map();
  let fetcher = () => { throw new Error("Unexpected external API call"); };
  function load(filename) {
    filename = path.resolve(root, filename);
    if (cache.has(filename)) return cache.get(filename).exports;
    if (filename.endsWith(".json")) return JSON.parse(readFileSync(filename, "utf8"));
    const module = { exports: {} }; cache.set(filename, module);
    const code = ts.transpileModule(readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
    const context = { Request, Response, Headers, File, FormData, Blob, URL, TextEncoder, TextDecoder, Uint8Array, ArrayBuffer, crypto, btoa, atob, console, AbortSignal, setTimeout, clearTimeout, fetch: (...args) => fetcher(...args) };
    const require = (specifier) => {
      if (specifier === "cloudflare:workers") return { env };
      if (specifier.endsWith("chatgpt-auth")) return { getChatGPTUser: async () => user ? { userId: user } : null };
      if (specifier.startsWith(".")) { const next = path.resolve(path.dirname(filename), specifier); return load(/\.(json|ts)$/.test(next) ? next : next + ".ts"); }
      return nativeRequire(specifier);
    };
    vm.runInNewContext(`(function(require,module,exports){${code}\n})`, context, { filename })(require, module, module.exports);
    return module.exports;
  }
  const request = (path, method = "GET", body) => new Request(origin + path, { method, ...(method === "GET" ? {} : { headers: { Origin: origin, "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }) });
  return { load, db, sqlite, env, files, request, user(value) { user = value; }, fetch(fn) { fetcher = fn; } };
}

test("anonymous API calls cannot access records or save materials", async () => {
  const s = setup(); s.user(null);
  const attempts = s.load("app/api/attempts/[[...parts]]/route.ts");
  assert.equal((await attempts.GET(s.request("/api/attempts"))).status, 401);
  assert.equal((await attempts.POST(s.request("/api/attempts", "POST", {}))).status, 401);
  const materials = s.load("app/api/materials/route.ts");
  assert.equal((await materials.PUT(s.request("/api/materials", "PUT", {}))).status, 401);
});

test("another account cannot read, change, upload to, or delete a practice", async () => {
  const s = setup(); const routes = s.load("app/api/attempts/[[...parts]]/route.ts");
  const created = await routes.POST(s.request("/api/attempts", "POST", { title: "Private practice" }));
  assert.equal(created.status, 201);
  const { attempt } = await created.json();
  s.user("owner-b");
  assert.equal((await (await routes.GET(s.request("/api/attempts"))).json()).attempts.length, 0);
  assert.equal((await routes.GET(s.request(`/api/attempts/${attempt.id}`))).status, 404);
  assert.equal((await routes.GET(s.request(`/api/attempts/${attempt.id}/files/audio/1`))).status, 404);
  assert.equal((await routes.PUT(s.request(`/api/attempts/${attempt.id}/prompts`, "PUT", { prompts: Array(11).fill("Hello") }))).status, 404);
  assert.equal((await routes.POST(s.request(`/api/attempts/${attempt.id}/uploads/audio/1/${crypto.randomUUID()}/0`, "POST", {}))).status, 404);
  assert.equal((await routes.DELETE(s.request(`/api/attempts/${attempt.id}`, "DELETE"))).status, 404);
  assert.equal(s.files.size, 0);
  s.user("owner-a"); assert.equal((await routes.GET(s.request(`/api/attempts/${attempt.id}`))).status, 200);
});

test("API keys are encrypted and neither key nor configuration leaks across accounts", async () => {
  const s = setup(); const routes = s.load("app/api/settings/route.ts");
  const key = "unit-test-owner-a-key-123456789";
  assert.equal((await routes.PUT(s.request("/api/settings", "PUT", { key }))).status, 200);
  const row = s.sqlite.prepare("SELECT * FROM provider_credentials").get();
  assert.ok(!JSON.stringify(row).includes(key));
  assert.equal((await s.load("lib/provider.ts").getCredential("owner-a")).key, key);
  const ownSettings = JSON.stringify(await (await routes.GET()).json()); assert.ok(!ownSettings.includes(key)); assert.ok(!ownSettings.includes(row.ciphertext));
  s.user("owner-b"); assert.equal((await (await routes.GET()).json()).configured, false);
  await routes.DELETE(s.request("/api/settings", "DELETE"));
  assert.equal(s.sqlite.prepare("SELECT count(*) AS n FROM provider_credentials").get().n, 1);
});

test("shared materials are the default; personal overrides and deletion are account-scoped", async () => {
  const s = setup(); const routes = s.load("app/api/materials/route.ts");
  const shared = await (await routes.GET()).json(); assert.equal(shared.source, "shared"); assert.equal(shared.material.reasons.length, 12);
  const mine = structuredClone(shared.material); mine.reasons[0] = { theme: "My private reason", sentence: "My own distinctive reason improves focus" };
  assert.equal((await routes.PUT(s.request("/api/materials", "PUT", mine))).status, 200);
  assert.equal((await (await routes.GET()).json()).source, "personal");
  s.user("owner-b"); const other = await (await routes.GET()).json(); assert.equal(other.source, "shared"); assert.ok(!JSON.stringify(other).includes("distinctive"));
  await routes.DELETE(s.request("/api/materials", "DELETE"));
  s.user("owner-a"); assert.equal((await (await routes.GET()).json()).source, "personal");
  await routes.DELETE(s.request("/api/materials", "DELETE"));
  assert.equal((await (await routes.GET()).json()).source, "shared");
  assert.equal((await routes.PUT(s.request("/api/materials", "PUT", { ...mine, reasons: mine.reasons.slice(1) }))).status, 400);
});

test("cross-site mutations are rejected before storage changes", async () => {
  const s = setup(); const routes = s.load("app/api/attempts/[[...parts]]/route.ts");
  const request = new Request(origin + "/api/attempts", { method: "POST", headers: { Origin: "https://other.example", "Content-Type": "application/json" }, body: "{}" });
  assert.equal((await routes.POST(request)).status, 403);
  assert.equal(s.sqlite.prepare("SELECT count(*) AS n FROM attempts").get().n, 0);
});

test("recommendations use the active material library and retain the user's original response", async () => {
  const s = setup(); const provider = s.load("lib/provider.ts"); await provider.saveCredential("owner-a", "test-api-key-not-a-real-secret", provider.DEFAULT_MODELS);
  const routes = s.load("app/api/materials/route.ts"); const shared = (await (await routes.GET()).json()).material;
  const attempt = { prompts: Array(11).fill("Why do you enjoy learning?"), results: Array(11).fill({ transcript: "I enjoy learning with my sister.", advice: "Add detail", audibleEvidence: "Clear speech" }) };
  const recommend = s.load("lib/recommend.ts").recommendAnswer;
  async function generate(material) {
    let input;
    s.fetch(async (_url, options) => { input = JSON.parse(options.body).messages[0].content; return Response.json({ choices: [{ message: { content: JSON.stringify({ answer: `I enjoy learning with my sister. ${material.reasons[0].sentence}. ${material.reasons[1].sentence}.`, reasonIds: [1, 2], materialIds: [], optimizationNote: "Retained the original example." }) } }] }); });
    const result = await recommend("owner-a", attempt, 8); assert.ok(input.includes(attempt.results[7].transcript)); assert.equal(result.selectedReasons[0].sentence, material.reasons[0].sentence);
    return input;
  }
  await generate(shared);
  const mine = structuredClone(shared); mine.reasons[0] = { theme: "Focus", sentence: "Working together gives me steady motivation" };
  await routes.PUT(s.request("/api/materials", "PUT", mine)); await generate(mine);
});

test("language preference survives cookie round trips and localizes dynamic messages", () => {
  const s = setup(); const locale = s.load("lib/language.ts");
  assert.equal(locale.languageFromCookie(locale.languageCookie("en", true)), "en");
  assert.equal(locale.languageFromCookie(locale.languageCookie("zh")), "zh");
  assert.equal(locale.languageFromCookie("studio_language=invalid"), "zh");
  assert.equal(locale.requestLanguage({ headers: new Headers({ cookie: "studio_language=en" }) }), "en");
  assert.equal(locale.requestLanguage({ headers: new Headers({ cookie: "studio_language=en", "x-studio-language": "zh" }) }), "zh");
  assert.equal(locale.translateText("正在评分第 {0}/11 题…", "en", 8), "Scoring question 8/11…");
  assert.equal(locale.translateText("Scoring question 8/11…", "zh"), "正在评分第 8/11 题…");
  assert.equal(locale.translateText("ztoken chat/completions 接口返回 502。请检查 API 设置后重试。", "en"), "ztoken chat/completions returned 502. Check your API settings and try again.");
  assert.equal(locale.translateText("My original answer and my file.wav", "zh"), "My original answer and my file.wav");
});

test("English requests receive English API errors and default practice names", async () => {
  const s = setup(); const routes = s.load("app/api/attempts/[[...parts]]/route.ts");
  const englishRequest = (url, body) => new Request(origin + url, { method: "POST", headers: { Origin: origin, Cookie: "studio_language=en", "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const created = await routes.POST(englishRequest("/api/attempts", {}));
  assert.match((await created.json()).attempt.title, /^Speaking practice · /);
  const invalid = await routes.POST(englishRequest("/api/attempts", { title: 5 }));
  assert.equal((await invalid.json()).error, "The practice name format is invalid.");
  s.user(null);
  const denied = await routes.GET(new Request(origin + "/api/attempts", { headers: { Cookie: "studio_language=en" } }));
  assert.equal((await denied.json()).error, "Sign in to continue.");
});

test("output language reaches audio scoring, recommendations, and overall estimation", async () => {
  const s = setup(); const provider = s.load("lib/provider.ts"); await provider.saveCredential("owner-a", "test-language-api-key-12345", provider.DEFAULT_MODELS);
  s.load("lib/references.ts").getReferenceAudio = async () => [3, 4, 5].map((score) => ({ score, bytes: new Uint8Array([1, 2, 3]) }));
  const calls = [];
  s.fetch(async (_url, options) => { const body = JSON.parse(options.body); calls.push(body); return Response.json({ choices: [{ message: { content: JSON.stringify({ score: 3, transcript: "My original response", audibleEvidence: "Clear words", reason: "Relevant response", advice: "Develop the example" }) } }] }); });
  const evaluate = s.load("lib/evaluate.ts");
  const scored = await evaluate.scoreItem("owner-a", 8, "Why do you study?", { type: "audio/wav" }, new Uint8Array([1, 2, 3]), "en");
  assert.equal(scored.score, 3);
  assert.match(calls[0].messages[0].content[0].text, /OUTPUT LANGUAGE:.*English/);
  assert.equal(calls[0].messages.filter((m) => m.content.some((c) => c.type === "input_audio")).length, 4);
  const attempt = { prompts: Array(11).fill("Why do you study?"), results: Array(11).fill(scored) };
  const shared = s.load("lib/shared-material.ts").sharedMaterial;
  s.fetch(async (_url, options) => { const body = JSON.parse(options.body); calls.push(body); return Response.json({ choices: [{ message: { content: JSON.stringify({ answer: `My original response. ${shared.reasons[0].sentence}. ${shared.reasons[1].sentence}.`, reasonIds: [1, 2] }) } }] }); });
  await s.load("lib/recommend.ts").recommendAnswer("owner-a", attempt, 8, "en");
  assert.match(calls[1].messages[0].content, /OUTPUT LANGUAGE:.*English/);
  s.fetch(async (_url, options) => { const body = JSON.parse(options.body); calls.push(body); return Response.json({ output_text: JSON.stringify({ band: 3.5, note: "An estimate based on all responses." }) }); });
  await evaluate.estimateBand("owner-a", attempt, "en");
  assert.match(calls[2].input, /OUTPUT LANGUAGE:.*English/);
});
