import {
  clampIndent,
  createEditorBlock,
  markdownToBlocks,
  type EditorBlock,
  type EditorBlockType
} from "./editorModel";

export interface EditorActionResult {
  blocks: EditorBlock[];
  focusId: string;
  focusOffset?: number;
  handled: boolean;
}

export function applyShortcutToBlock(blocks: EditorBlock[], blockId: string, offset: number): EditorActionResult {
  const next = cloneBlocks(blocks);
  const block = findBlock(next, blockId);
  if (!block || offset !== block.text.length) {
    return unchanged(blocks, blockId, offset);
  }

  const marker = block.text.trim();
  if (marker === "-" || marker === "*") {
    block.type = "bullet";
    block.text = "";
  } else if (block.type === "bullet" && /^-?\s*\[\s]$/.test(marker)) {
    block.type = "todo";
    block.checked = false;
    block.text = "";
  } else if (block.type === "bullet" && /^-?\s*\[(x|X)]$/.test(marker)) {
    block.type = "todo";
    block.checked = true;
    block.text = "";
  } else if (/^\d+\.$/.test(marker)) {
    block.type = "ordered";
    block.text = "";
  } else if (/^-\s+\[\s]$/.test(marker)) {
    block.type = "todo";
    block.checked = false;
    block.text = "";
  } else if (/^-\s+\[(x|X)]$/.test(marker)) {
    block.type = "todo";
    block.checked = true;
    block.text = "";
  } else if (marker === ">") {
    block.type = "quote";
    block.text = "";
  } else {
    return unchanged(blocks, blockId, offset);
  }

  return { blocks: next, focusId: block.id, focusOffset: 0, handled: true };
}

export function splitEditorBlock(blocks: EditorBlock[], blockId: string, offset: number): EditorActionResult {
  const next = cloneBlocks(blocks);
  const index = blockIndex(next, blockId);
  const block = next[index];
  if (!block) {
    return unchanged(blocks, blockId, offset);
  }

  if (block.type !== "paragraph" && !block.text.trim()) {
    block.type = "paragraph";
    block.indent = 0;
    block.checked = false;
    return { blocks: next, focusId: block.id, focusOffset: 0, handled: true };
  }

  const before = block.text.slice(0, offset);
  const after = block.text.slice(offset);
  block.text = before;
  const nextBlock = createEditorBlock({
    type: block.type === "image" ? "paragraph" : block.type,
    text: after,
    indent: block.indent,
    checked: block.type === "todo" ? false : undefined
  });

  next.splice(index + 1, 0, nextBlock);
  return { blocks: next, focusId: nextBlock.id, focusOffset: 0, handled: true };
}

export function backspaceAtBlockStart(blocks: EditorBlock[], blockId: string): EditorActionResult {
  const next = cloneBlocks(blocks);
  const index = blockIndex(next, blockId);
  const block = next[index];
  if (!block) {
    return unchanged(blocks, blockId, 0);
  }

  if (block.type !== "paragraph" && !block.text) {
    block.type = "paragraph";
    block.indent = 0;
    block.checked = false;
    return { blocks: next, focusId: block.id, focusOffset: 0, handled: true };
  }

  if (block.indent > 0) {
    block.indent = block.indent - 1;
    return { blocks: next, focusId: block.id, focusOffset: 0, handled: true };
  }

  if (index <= 0) {
    return unchanged(blocks, blockId, 0);
  }

  const previous = next[index - 1];
  if (previous.type === "image") {
    next.splice(index - 1, 1);
    return { blocks: next, focusId: block.id, focusOffset: 0, handled: true };
  }

  const focusOffset = previous.text.length;
  previous.text += block.text;
  next.splice(index, 1);
  return { blocks: next, focusId: previous.id, focusOffset, handled: true };
}

export function changeEditorBlockIndent(blocks: EditorBlock[], blockId: string, delta: number): EditorActionResult {
  const next = cloneBlocks(blocks);
  const index = blockIndex(next, blockId);
  const block = next[index];
  if (!block || block.type === "paragraph" || block.type === "image") {
    return unchanged(blocks, blockId, 0);
  }

  const previous = next[index - 1];
  const maxIndent = previous ? previous.indent + 1 : 0;
  block.indent = clampIndent(Math.min(maxIndent, block.indent + delta));
  return { blocks: next, focusId: block.id, handled: true };
}

export function setEditorBlockType(blocks: EditorBlock[], blockId: string, type: EditorBlockType): EditorActionResult {
  const next = cloneBlocks(blocks);
  const block = findBlock(next, blockId);
  if (!block) {
    return unchanged(blocks, blockId, 0);
  }

  if (block.type === type && type !== "todo") {
    block.type = "paragraph";
    block.indent = 0;
  } else {
    block.type = type;
    if (type === "todo") {
      block.checked = Boolean(block.checked);
    }
    if (type === "paragraph") {
      block.indent = 0;
    }
  }

  return { blocks: next, focusId: block.id, focusOffset: block.text.length, handled: true };
}

export function pasteMarkdownIntoBlock(blocks: EditorBlock[], blockId: string, offset: number, markdown: string): EditorActionResult {
  const next = cloneBlocks(blocks);
  const index = blockIndex(next, blockId);
  const block = next[index];
  if (!block) {
    return unchanged(blocks, blockId, offset);
  }

  const pasted = markdownToBlocks(markdown);
  const before = block.text.slice(0, offset);
  const after = block.text.slice(offset);
  const first = pasted[0] || createEditorBlock();
  block.text = before + first.text;
  block.type = first.type;
  block.indent = first.indent;
  block.checked = first.checked;
  block.src = first.src;
  block.alt = first.alt;

  const rest = pasted.slice(1);
  if (after) {
    rest.push(createEditorBlock({ type: block.type, text: after, indent: block.indent }));
  }
  next.splice(index + 1, 0, ...rest);
  const focus = rest[rest.length - 1] || block;
  return { blocks: next, focusId: focus.id, focusOffset: focus.text.length, handled: true };
}

export function insertBlocksAfter(blocks: EditorBlock[], blockId: string, nextBlocks: EditorBlock[]): EditorActionResult {
  const index = Math.max(0, blockIndex(blocks, blockId));
  const next = [...blocks.slice(0, index + 1), ...nextBlocks, ...blocks.slice(index + 1)];
  const focus = nextBlocks[0] || blocks[index];
  return { blocks: next, focusId: focus.id, focusOffset: focus.text.length, handled: true };
}

export function deleteEditorBlock(blocks: EditorBlock[], blockId: string): EditorActionResult {
  const index = blockIndex(blocks, blockId);
  if (index < 0) {
    return unchanged(blocks, blockId, 0);
  }

  const next = cloneBlocks(blocks);
  next.splice(index, 1);
  if (next.length === 0) {
    const empty = createEditorBlock();
    return { blocks: [empty], focusId: empty.id, focusOffset: 0, handled: true };
  }

  const focus = next[Math.min(index, next.length - 1)];
  return { blocks: next, focusId: focus.id, focusOffset: focus.text.length, handled: true };
}

function unchanged(blocks: EditorBlock[], focusId: string, focusOffset?: number): EditorActionResult {
  return { blocks, focusId, focusOffset, handled: false };
}

function cloneBlocks(blocks: EditorBlock[]): EditorBlock[] {
  return blocks.map((block) => ({ ...block }));
}

function findBlock(blocks: EditorBlock[], blockId: string): EditorBlock | undefined {
  return blocks.find((block) => block.id === blockId);
}

function blockIndex(blocks: EditorBlock[], blockId: string): number {
  return blocks.findIndex((block) => block.id === blockId);
}
