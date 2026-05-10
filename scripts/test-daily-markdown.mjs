import { strict as assert } from "node:assert";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
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

const sourcePath = resolve(process.cwd(), "src/lib/dailyMarkdown.ts");
const output = transpile(sourcePath);

const moduleUrl = `data:text/javascript;base64,${Buffer.from(output).toString("base64")}`;
const { buildDailyMarkdown } = await import(moduleUrl);
const markdownOutput = transpile(resolve(process.cwd(), "src/lib/markdown.ts"));
const { firstLine, renderMarkdownPreview } = await import(`data:text/javascript;base64,${Buffer.from(markdownOutput).toString("base64")}`);
const editorModelOutput = transpile(resolve(process.cwd(), "src/lib/editorModel.ts"));
const { blocksToMarkdown, markdownToBlocks } = await import(`data:text/javascript;base64,${Buffer.from(editorModelOutput).toString("base64")}`);
const tagServiceOutput = transpile(resolve(process.cwd(), "src/lib/tagService.ts"));
const { buildCardTags, extractTags, filterCards, removeTagFromMarkdown, replaceTagInMarkdown, stripTagControlChars, tagMatchesSelection } = await import(`data:text/javascript;base64,${Buffer.from(tagServiceOutput).toString("base64")}`);
const createdAt = new Date(2026, 3, 30, 17, 0, 15).getTime();

const tempDir = join(tmpdir(), `cardnote-tests-${Date.now()}`);
mkdirSync(tempDir, { recursive: true });
writeFileSync(join(tempDir, "dailyMarkdown.mjs"), output);
writeFileSync(
  join(tempDir, "dailyBlock.mjs"),
  transpile(resolve(process.cwd(), "src/lib/dailyBlock.ts")).replaceAll("./dailyMarkdown", "./dailyMarkdown.mjs")
);
const { parseDailyBlock, normalizeMarkdown, stripKramdownAttrs } = await import(`file://${join(tempDir, "dailyBlock.mjs")}`);

assert.equal(
  stripKramdownAttrs('{: id="20260501183204-mucmloq" updated="20260501183204"}2026-04-30 17:00:43 测试标题'),
  "2026-04-30 17:00:43 测试标题"
);

assert.equal(stripTagControlChars("\u200B#test# 测试"), "#test# 测试");
assert.deepEqual(extractTags("\u200B#test# 测试"), ["test"]);
assert.deepEqual(buildCardTags("", "\u200B#test# 测试"), ["test"]);
assert.equal(stripKramdownAttrs("\u200B#test# 测试"), "#test# 测试");
assert.equal(tagMatchesSelection("Tag/选题", "Tag"), true);
assert.equal(tagMatchesSelection("Tag/选题", "Tag/选题"), true);
assert.equal(tagMatchesSelection("Tag/选题", "选题"), false);
assert.equal(replaceTagInMarkdown("#Tag/选题# 内容", "Tag", "Topic"), "#Topic/选题# 内容");
assert.equal(removeTagFromMarkdown("#Tag/选题# 内容", "Tag").trim(), "内容");
assert.deepEqual(
  filterCards([
    { id: "1", title: "", content: "#Tag/选题# A", tags: [], createdAt: 1, updatedAt: 1, pinned: false },
    { id: "2", title: "", content: "#Other# B", tags: [], createdAt: 2, updatedAt: 2, pinned: false }
  ], "", "Tag", "all", "all", "createdAsc").map((card) => card.id),
  ["1"]
);

assert.deepEqual(
  parseDailyBlock(`{: id="20260501183204-mucmloq" updated="20260501183204"}2026-04-30 17:00:43 测试标题

  {: id="20260501183204-453tg6r" updated="20260501183204"}插入图片时，与上下文的内容合并成了一个块
  - {: id="20260501183204-x3kmkdt" updated="20260501183204"}使用无序列表时
  {: id="20260501183204-obyg985" updated="20260501183204"}- [ ] 所见即所得的编辑器`),
  {
    title: "测试标题",
    content: "插入图片时，与上下文的内容合并成了一个块\n- 使用无序列表时\n- [ ] 所见即所得的编辑器"
  }
);

assert.equal(
  normalizeMarkdown(`- {: id="x"}2026-05-02 15:58:30

  {: updated="x" id="y"}回读测试123`),
  "- 2026-05-02 15:58:30\n\n  回读测试123"
);

assert.equal(
  normalizeMarkdown(`- 2026-05-10 15:13:34

  测试图片删除

  测试

  测试`),
  "- 2026-05-10 15:13:34\n\n  测试图片删除\n  测试\n  测试"
);

assert.equal(
  normalizeMarkdown(`- 2026-05-10 15:13:34

  测试数据

  > 回顾想法 2026-05-10 15:13
  > 追加想法1
  >
  >

  > 回顾想法 2026-05-10 15:14
  > 追加想法2
  >`),
  "- 2026-05-10 15:13:34\n\n  测试数据\n\n  > 回顾想法 2026-05-10 15:13\n  > 追加想法1\n\n  > 回顾想法 2026-05-10 15:14\n  > 追加想法2"
);

assert.equal(
  buildDailyMarkdown({
    id: "card-1",
    title: "测试标题",
    content: "正文第一行\n正文第二行",
    tags: [],
    createdAt,
    updatedAt: createdAt,
    pinned: false
  }),
  "- 2026-04-30 17:00:15 测试标题\n\n  正文第一行\n\n  正文第二行"
);

assert.equal(
  buildDailyMarkdown({
    id: "card-2",
    content: "无标题正文",
    tags: [],
    createdAt,
    updatedAt: createdAt,
    pinned: false
  }),
  "- 2026-04-30 17:00:15\n\n  无标题正文"
);

assert.equal(
  buildDailyMarkdown({
    id: "card-3",
    title: "  多   空格标题  ",
    content: "",
    tags: [],
    createdAt,
    updatedAt: createdAt,
    pinned: false
  }),
  "- 2026-04-30 17:00:15 多 空格标题"
);

assert.equal(
  buildDailyMarkdown({
    id: "card-4",
    title: "标签格式",
    content: "正文 #灵感 和 #思源#",
    tags: ["灵感", "思源"],
    createdAt,
    updatedAt: createdAt,
    pinned: false
  }),
  "- 2026-04-30 17:00:15 标签格式\n\n  正文 #灵感# 和 #思源#"
);

assert.equal(firstLine("- 测试1\n  - 测试2"), "测试1");

assert.equal(
  renderMarkdownPreview("- 测试1\n  - 测试2"),
  "<ul><li>测试1<ul><li>测试2</li></ul></li></ul>"
);

assert.deepEqual(
  markdownToBlocks("- 测试1\n  - 测试2").map(({ type, text, indent }) => ({ type, text, indent })),
  [
    { type: "bullet", text: "测试1", indent: 0 },
    { type: "bullet", text: "测试2", indent: 1 }
  ]
);

assert.equal(
  blocksToMarkdown(markdownToBlocks("- 测试1\n  - [ ] 测试2\n1. 测试3\n2. 测试4")),
  "- 测试1\n  - [ ] 测试2\n1. 测试3\n2. 测试4"
);

console.log("daily markdown tests passed");
