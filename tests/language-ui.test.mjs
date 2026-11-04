import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const root = path.resolve(import.meta.dirname, "..");
const nativeRequire = createRequire(import.meta.url);
const cache = new Map();
function load(relative) {
  const filename = path.resolve(root, relative);
  if (cache.has(filename)) return cache.get(filename).exports;
  if (filename.endsWith(".json")) return JSON.parse(readFileSync(filename, "utf8"));
  const module = { exports: {} }; cache.set(filename, module);
  const code = ts.transpileModule(readFileSync(filename, "utf8"), { fileName: filename, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const require = (name) => {
    if (!name.startsWith(".")) return nativeRequire(name);
    const target = path.resolve(path.dirname(filename), name);
    const extension = /\.(json|tsx?)$/.test(target) ? "" : [".tsx", ".ts"].find((ext) => { try { readFileSync(target + ext); return true; } catch { return false; } });
    return load(target + extension);
  };
  vm.runInNewContext(`(function(require,module,exports){${code}\n})`, { console }, { filename })(require, module, module.exports);
  return module.exports;
}

test("English upload, tutorial, and material screens render without untranslated UI text", () => {
  const { LanguageProvider } = load("app/language.tsx");
  const screens = [
    [load("app/studio.tsx").default, { displayName: "Test User" }, "Start a speaking practice"],
    [load("app/tutorial.tsx").default, { configured: false, onPractice() {}, onSettings() {}, onHistory() {} }, "Frequently asked questions"],
    [load("app/materials.tsx").default, {}, "12 core phrases"],
  ];
  for (const [Screen, props, heading] of screens) {
    const markup = renderToStaticMarkup(React.createElement(LanguageProvider, { initialLanguage: "en" }, React.createElement(Screen, props)));
    assert.ok(markup.includes(heading));
    // The language chooser intentionally shows both native language names.
    const text = markup.replace(/<label class="language-switcher">[\s\S]*?<\/label>/, "").replace(/<[^>]*>/g, "");
    assert.ok(!/[\u3400-\u9fff]/.test(text), `Untranslated screen text: ${text.match(/.{0,20}[\u3400-\u9fff].{0,35}/)?.[0]}`);
  }
  const Chinese = renderToStaticMarkup(React.createElement(LanguageProvider, { initialLanguage: "zh" }, React.createElement(screens[0][0], screens[0][1])));
  assert.ok(Chinese.includes("开始一次口语评分"));
});

test("all static UI translation keys have English entries and matching interpolation slots", () => {
  const catalog = JSON.parse(readFileSync(path.join(root, "lib/messages-en.json"), "utf8"));
  for (const file of ["app/studio.tsx", "app/tutorial.tsx", "app/materials.tsx"]) {
    const source = ts.createSourceFile(file, readFileSync(path.join(root, file), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    function visit(node) {
      if (ts.isCallExpression(node) && node.expression.getText(source) === "t" && ts.isStringLiteral(node.arguments[0])) {
        const key = node.arguments[0].text;
        assert.ok(Object.hasOwn(catalog, key), `Missing translation in ${file}: ${key}`);
        assert.deepEqual(key.match(/\{\d+\}/g) ?? [], catalog[key].match(/\{\d+\}/g) ?? [], `Interpolation mismatch: ${key}`);
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
});
