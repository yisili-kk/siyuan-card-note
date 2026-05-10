import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";

function transpile(sourcePath) {
  const source = readFileSync(sourcePath, "utf8");
  return ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2020
    }
  }).outputText;
}

const output = transpile(resolve(process.cwd(), "src/lib/markdown.ts"));
const { renderMarkdownPreview } = await import(`data:text/javascript;base64,${Buffer.from(output).toString("base64")}`);

const html = renderMarkdownPreview("原始内容\n\n> 回顾想法 2026-05-10 10:24\n> 记录想法测试");
assert.ok(html.includes('<section class="scn-review-idea">'));
assert.ok(html.includes("回顾想法 · 2026-05-10 10:24"));
assert.ok(html.includes('<div class="scn-review-idea__body">记录想法测试</div>'));
assert.equal((html.match(/<blockquote>/g) || []).length, 0);

const quoteHtml = renderMarkdownPreview("> 普通引用\n> 第二行");
assert.equal((quoteHtml.match(/<blockquote>/g) || []).length, 2);

const tagHtml = renderMarkdownPreview("#Tag/选题 测试");
assert.ok(tagHtml.includes('<span class="scn-md-tag">#Tag/选题</span> 测试'));
assert.ok(!tagHtml.includes("#Tag/选题#"));

console.log("markdown render tests passed");
