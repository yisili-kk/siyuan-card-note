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

const modelOutput = transpile(resolve(process.cwd(), "src/lib/editorModel.ts"));
const tempDir = join(tmpdir(), `cardnote-editor-actions-${Date.now()}`);
mkdirSync(tempDir, { recursive: true });
const modelPath = join(tempDir, "editorModel.mjs");
const actionPath = join(tempDir, "editorActions.mjs");
const modelUrl = `file://${modelPath}`;
const actionOutput = transpile(resolve(process.cwd(), "src/lib/editorActions.ts")).replaceAll("./editorModel", modelUrl);
writeFileSync(modelPath, modelOutput);
writeFileSync(actionPath, actionOutput);

const { blocksToMarkdown, createEditorBlock, markdownToBlocks } = await import(modelUrl);
const {
  applyShortcutToBlock,
  backspaceAtBlockStart,
  changeEditorBlockIndent,
  deleteEditorBlock,
  pasteMarkdownIntoBlock,
  setEditorBlockType,
  splitEditorBlock
} = await import(`file://${actionPath}`);

function editor(markdown = "") {
  return {
    blocks: markdownToBlocks(markdown),
    focusId: "",
    offset: 0
  };
}

function focusEnd(state, index = 0) {
  const block = state.blocks[index];
  state.focusId = block.id;
  state.offset = block.text.length;
  return state;
}

function apply(state, result) {
  assert.equal(result.handled, true);
  state.blocks = result.blocks;
  state.focusId = result.focusId;
  state.offset = result.focusOffset ?? state.blocks.find((block) => block.id === state.focusId)?.text.length ?? 0;
  return state;
}

function typeText(state, text) {
  const block = state.blocks.find((item) => item.id === state.focusId);
  block.text = `${block.text.slice(0, state.offset)}${text}${block.text.slice(state.offset)}`;
  state.offset += text.length;
  return state;
}

function shortcut(state) {
  return apply(state, applyShortcutToBlock(state.blocks, state.focusId, state.offset));
}

function enter(state) {
  return apply(state, splitEditorBlock(state.blocks, state.focusId, state.offset));
}

function tab(state) {
  return apply(state, changeEditorBlockIndent(state.blocks, state.focusId, 1));
}

function shiftTab(state) {
  return apply(state, changeEditorBlockIndent(state.blocks, state.focusId, -1));
}

let state = focusEnd(editor());
typeText(state, "-");
shortcut(state);
typeText(state, "测试1");
assert.equal(blocksToMarkdown(state.blocks), "- 测试1");

enter(state);
typeText(state, "测试2");
assert.equal(blocksToMarkdown(state.blocks), "- 测试1\n- 测试2");

tab(state);
assert.equal(blocksToMarkdown(state.blocks), "- 测试1\n  - 测试2");

shiftTab(state);
assert.equal(blocksToMarkdown(state.blocks), "- 测试1\n- 测试2");

enter(state);
assert.equal(blocksToMarkdown(state.blocks), "- 测试1\n- 测试2\n-");
enter(state);
assert.equal(blocksToMarkdown(state.blocks), "- 测试1\n- 测试2");

state = focusEnd(editor());
typeText(state, "1.");
shortcut(state);
typeText(state, "有序1");
enter(state);
typeText(state, "有序2");
assert.equal(blocksToMarkdown(state.blocks), "1. 有序1\n2. 有序2");

state = focusEnd(editor());
typeText(state, "-");
shortcut(state);
typeText(state, "[ ]");
shortcut(state);
typeText(state, "待办1");
enter(state);
typeText(state, "待办2");
assert.equal(blocksToMarkdown(state.blocks), "- [ ] 待办1\n- [ ] 待办2");

state = focusEnd(editor("- 父级\n- 子级"), 1);
tab(state);
assert.equal(blocksToMarkdown(state.blocks), "- 父级\n  - 子级");

state = focusEnd(editor("- 父级\n  - 子级"), 1);
apply(state, backspaceAtBlockStart(state.blocks, state.focusId));
assert.equal(blocksToMarkdown(state.blocks), "- 父级\n- 子级");

state = focusEnd(editor("开头结尾"));
state.offset = 2;
apply(state, pasteMarkdownIntoBlock(state.blocks, state.focusId, state.offset, "- A\n  - B"));
assert.equal(blocksToMarkdown(state.blocks), "- 开头A\n  - B\n- 结尾");

state = focusEnd(editor("普通"));
apply(state, setEditorBlockType(state.blocks, state.focusId, "quote"));
assert.equal(blocksToMarkdown(state.blocks), "> 普通");

assert.equal(
  blocksToMarkdown([
    createEditorBlock({ type: "bullet", text: "第一条", indent: 0 }),
    createEditorBlock({ type: "bullet", text: "不能悬空缩进", indent: 0 })
  ]),
  "- 第一条\n- 不能悬空缩进"
);

state = focusEnd(editor("前文\n![image](assets/test.png)\n后文"), 1);
apply(state, deleteEditorBlock(state.blocks, state.focusId));
assert.equal(blocksToMarkdown(state.blocks), "前文\n后文");
assert.equal(state.blocks.find((block) => block.id === state.focusId)?.text, "后文");

state = focusEnd(editor("![image](assets/test.png)"), 0);
apply(state, deleteEditorBlock(state.blocks, state.focusId));
assert.equal(blocksToMarkdown(state.blocks), "");
assert.equal(state.blocks.length, 1);

state = focusEnd(editor("前文\n![image](assets/test.png)\n后文"), 2);
state.offset = 0;
apply(state, backspaceAtBlockStart(state.blocks, state.focusId));
assert.equal(blocksToMarkdown(state.blocks), "前文\n后文");
assert.equal(state.blocks.find((block) => block.id === state.focusId)?.text, "后文");

console.log("editor action tests passed");
