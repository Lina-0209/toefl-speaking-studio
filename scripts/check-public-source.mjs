import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const files = execFileSync("git", ["ls-files", "--cached"], { encoding: "utf8" }).trim().split("\n").filter(Boolean);
const forbidden = [/^\.env(?!\.example$)/, /^\.dev\.vars(?!\.example$)/, /^(?:node_modules|dist|\.wrangler|\.sites-runtime|releases)\//, /\.(?:wav|mp3|m4a|sqlite|db|docx)$/i];
for (const file of files) {
  assert.ok(!forbidden.some((pattern) => pattern.test(file)), `Excluded runtime or user data: ${file}`);
  const content = readFileSync(file, "utf8");
  assert.ok(!/sk-[A-Za-z0-9_-]{20,}/.test(content), `Possible API key: ${file}`);
  assert.ok(!/appgprj_[a-z0-9]+/.test(content), `Private Site identity: ${file}`);
  assert.ok(!/\/Users\/[a-zA-Z0-9_-]+\//.test(content), `Personal filesystem path: ${file}`);
}
const hosting = JSON.parse(readFileSync(".openai/hosting.json", "utf8"));
assert.ok(!hosting.project_id, "Public source must not inherit the author's Site identity");
const material = JSON.parse(readFileSync("lib/study-material.json", "utf8"));
assert.ok(!material.source && !material.sourceSha256, "Shared library must not expose private file metadata");
console.log(`Public-source checks passed (${files.length} tracked files). No recording/history databases are included.`);
