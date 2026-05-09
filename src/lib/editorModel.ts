export type EditorBlockType = "paragraph" | "bullet" | "ordered" | "todo" | "quote" | "image";

export interface EditorBlock {
  id: string;
  type: EditorBlockType;
  text: string;
  indent: number;
  checked?: boolean;
  src?: string;
  alt?: string;
}

let idSeed = 0;

export function createEditorBlock(partial: Partial<EditorBlock> = {}): EditorBlock {
  return {
    id: partial.id || `block-${Date.now().toString(36)}-${(idSeed += 1).toString(36)}`,
    type: partial.type || "paragraph",
    text: partial.text || "",
    indent: clampIndent(partial.indent || 0),
    checked: partial.checked,
    src: partial.src,
    alt: partial.alt
  };
}

export function markdownToBlocks(markdown: string): EditorBlock[] {
  const source = markdown.replace(/\r\n/g, "\n");
  if (!source.trim()) {
    return [createEditorBlock()];
  }

  const blocks = compactImportedBlocks(source.split("\n").map((rawLine) => lineToBlock(rawLine)));
  return blocks.length > 0 ? blocks : [createEditorBlock()];
}

export function blocksToMarkdown(blocks: EditorBlock[]): string {
  const orderedCounters = new Map<number, number>();
  const lines = blocks.map((block) => {
    const indent = "  ".repeat(clampIndent(block.indent));
    if (block.type !== "ordered") {
      orderedCounters.delete(block.indent);
    }
    for (const key of [...orderedCounters.keys()]) {
      if (key > block.indent) {
        orderedCounters.delete(key);
      }
    }

    if (block.type === "image") {
      return block.src ? `${indent}![${block.alt || "image"}](${block.src})` : "";
    }
    if (block.type === "bullet") {
      return `${indent}- ${block.text}`.trimEnd();
    }
    if (block.type === "ordered") {
      const next = (orderedCounters.get(block.indent) || 0) + 1;
      orderedCounters.set(block.indent, next);
      return `${indent}${next}. ${block.text}`.trimEnd();
    }
    if (block.type === "todo") {
      return `${indent}- [${block.checked ? "x" : " "}] ${block.text}`.trimEnd();
    }
    if (block.type === "quote") {
      return `${indent}> ${block.text}`.trimEnd();
    }
    return block.text;
  });

  return normalizeEditorMarkdown(lines.join("\n"));
}

export function normalizeEditorMarkdown(markdown: string): string {
  const normalized = markdown
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .replace(/^\n+|\n+$/g, "")
    .replace(/[ \t]+$/g, "");
  return normalized.trim() ? normalized : "";
}

export function clampIndent(value: number): number {
  return Math.max(0, Math.min(6, value));
}

function lineToBlock(rawLine: string): EditorBlock {
  const line = rawLine.replace(/\t/g, "  ");
  const trimmedStart = line.trimStart();
  const indent = clampIndent(Math.floor((line.length - trimmedStart.length) / 2));

  if (!trimmedStart) {
    return createEditorBlock({ indent: 0 });
  }

  const image = trimmedStart.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
  if (image) {
    return createEditorBlock({ type: "image", alt: image[1] || "image", src: image[2], indent });
  }

  const todo = trimmedStart.match(/^[-*]\s+\[( |x|X)]\s*(.*)$/);
  if (todo) {
    return createEditorBlock({ type: "todo", checked: todo[1].toLowerCase() === "x", text: todo[2], indent });
  }

  const bullet = trimmedStart.match(/^[-*]\s+(.*)$/);
  if (bullet) {
    return createEditorBlock({ type: "bullet", text: bullet[1], indent });
  }

  const ordered = trimmedStart.match(/^\d+\.\s+(.*)$/);
  if (ordered) {
    return createEditorBlock({ type: "ordered", text: ordered[1], indent });
  }

  const quote = trimmedStart.match(/^>\s?(.*)$/);
  if (quote) {
    return createEditorBlock({ type: "quote", text: quote[1], indent });
  }

  return createEditorBlock({ type: "paragraph", text: line.trimEnd(), indent: 0 });
}

function compactImportedBlocks(blocks: EditorBlock[]): EditorBlock[] {
  const compacted: EditorBlock[] = [];
  for (const block of blocks) {
    const emptyParagraph = block.type === "paragraph" && !block.text.trim();
    if (emptyParagraph) {
      const previous = compacted[compacted.length - 1];
      if (!previous || (previous.type === "paragraph" && !previous.text.trim())) {
        continue;
      }
    }
    compacted.push(block);
  }

  while (compacted.length > 0) {
    const last = compacted[compacted.length - 1];
    if (last.type !== "paragraph" || last.text.trim()) {
      break;
    }
    compacted.pop();
  }

  return compacted;
}
