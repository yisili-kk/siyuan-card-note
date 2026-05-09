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

const editorModelOutput = transpile(resolve(process.cwd(), "src/lib/editorModel.ts"));
const { blocksToMarkdown, clampIndent, createEditorBlock, markdownToBlocks } = await import(
  `data:text/javascript;base64,${Buffer.from(editorModelOutput).toString("base64")}`
);

function shape(markdown) {
  return markdownToBlocks(markdown).map(({ type, text, indent, checked, src, alt }) => ({
    type,
    text,
    indent,
    ...(checked === undefined ? {} : { checked }),
    ...(src ? { src } : {}),
    ...(alt ? { alt } : {})
  }));
}

function roundTrip(markdown, expected = markdown.trim()) {
  assert.equal(blocksToMarkdown(markdownToBlocks(markdown)), expected);
}

assert.deepEqual(shape(""), [{ type: "paragraph", text: "", indent: 0 }]);
assert.equal(clampIndent(-1), 0);
assert.equal(clampIndent(12), 6);

roundTrip("普通段落");
roundTrip("第一段\n第二段");
roundTrip("带 #标签# 的段落");
roundTrip("**加粗** 和 `代码`");

assert.deepEqual(shape("- 测试1"), [{ type: "bullet", text: "测试1", indent: 0 }]);
roundTrip("- 测试1\n- 测试2");
roundTrip("- 测试1\n  - 测试2\n    - 测试3");
roundTrip("* 星号列表", "- 星号列表");

roundTrip("1. 有序1\n2. 有序2");
roundTrip("3. 粘贴来的编号\n4. 会重新编号", "1. 粘贴来的编号\n2. 会重新编号");
roundTrip("1. 父级\n  1. 子级1\n  2. 子级2\n2. 父级2");

assert.deepEqual(shape("- [ ] 待办"), [{ type: "todo", text: "待办", indent: 0, checked: false }]);
assert.deepEqual(shape("- [x] 已完成"), [{ type: "todo", text: "已完成", indent: 0, checked: true }]);
roundTrip("- [ ] 待办1\n  - [x] 待办2\n- 普通列表");

roundTrip("- 列表\n  1. 有序子项\n  - [ ] 待办子项\n段落");
roundTrip("> 引用");
roundTrip("- 父级\n  > 引用子项\n  - 子列表");

assert.deepEqual(shape("![图](assets/image.png)"), [
  { type: "image", text: "", indent: 0, src: "assets/image.png", alt: "图" }
]);
roundTrip("- 图片前\n  ![图](assets/image.png)\n- 图片后");

roundTrip("  - 前导两个空格", "  - 前导两个空格");
roundTrip("\t- Tab 缩进", "  - Tab 缩进");
roundTrip("- 末尾空格   ", "- 末尾空格");
roundTrip("段落\n\n- 空行后列表");

assert.equal(
  blocksToMarkdown([
    createEditorBlock({ type: "ordered", text: "一", indent: 0 }),
    createEditorBlock({ type: "ordered", text: "二", indent: 0 }),
    createEditorBlock({ type: "bullet", text: "打断", indent: 0 }),
    createEditorBlock({ type: "ordered", text: "重新开始", indent: 0 })
  ]),
  "1. 一\n2. 二\n- 打断\n1. 重新开始"
);

console.log("editor model tests passed");
