const ESCAPE_MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  "\"": "&quot;",
  "'": "&#39;"
};

export function renderMarkdownPreview(markdown: string): string {
  const lines = markdown.trim().split(/\r?\n/);
  const blocks: string[] = [];
  let paragraph: string[] = [];
  let listStack: Array<{ indent: number; ordered: boolean; items: string[] }> = [];

  const flushParagraph = () => {
    if (paragraph.length > 0) {
      blocks.push(`<p>${paragraph.map(renderInline).join("<br />")}</p>`);
      paragraph = [];
    }
  };
  const closeList = () => {
    const list = listStack.pop();
    if (!list) {
      return;
    }
    const html = `<${list.ordered ? "ol" : "ul"}>${list.items.join("")}</${list.ordered ? "ol" : "ul"}>`;
    const parent = listStack[listStack.length - 1];
    if (parent && parent.items.length > 0) {
      const lastIndex = parent.items.length - 1;
      parent.items[lastIndex] = parent.items[lastIndex].replace(/<\/li>$/, `${html}</li>`);
    } else {
      blocks.push(html);
    }
  };
  const flushLists = (indent = -1) => {
    while (listStack.length > 0 && listStack[listStack.length - 1].indent >= indent) {
      closeList();
    }
  };
  const pushListItem = (indent: number, ordered: boolean, itemHtml: string) => {
    while (listStack.length > 0) {
      const current = listStack[listStack.length - 1];
      if (current.indent > indent || (current.indent === indent && current.ordered !== ordered)) {
        closeList();
        continue;
      }
      break;
    }
    const current = listStack[listStack.length - 1];
    if (!current || current.indent < indent) {
      listStack.push({ indent, ordered, items: [] });
    }
    listStack[listStack.length - 1].items.push(itemHtml);
  };

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const rawLine = lines[lineIndex];
    const line = rawLine.trimEnd();
    const trimmed = line.trimStart();
    const indent = line.length - trimmed.length;
    if (!line.trim()) {
      flushParagraph();
      flushLists();
      continue;
    }
    const heading = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      flushLists();
      blocks.push(`<h${heading[1].length}>${renderInline(heading[2])}</h${heading[1].length}>`);
      continue;
    }
    if (/^>/.test(trimmed)) {
      flushParagraph();
      flushLists();
      const quoteLines = [trimmed.replace(/^>\s?/, "")];
      while (lineIndex + 1 < lines.length) {
        const nextTrimmed = lines[lineIndex + 1].trimEnd().trimStart();
        if (!/^>/.test(nextTrimmed)) {
          break;
        }
        quoteLines.push(nextTrimmed.replace(/^>\s?/, ""));
        lineIndex += 1;
      }
      const reviewIdea = quoteLines[0].match(/^回顾想法\s+(.+)$/);
      if (reviewIdea) {
        blocks.push(renderReviewIdea(reviewIdea[1], quoteLines.slice(1)));
      } else {
        blocks.push(...quoteLines.map((quoteLine) => `<blockquote>${renderInline(quoteLine)}</blockquote>`));
      }
      continue;
    }
    const todo = trimmed.match(/^[-*]\s+\[( |x|X)]\s+(.+)$/);
    if (todo) {
      flushParagraph();
      const checked = todo[1].toLowerCase() === "x" ? " checked" : "";
      pushListItem(indent, false, `<li class="scn-md-task"><input type="checkbox" disabled${checked} />${renderInline(todo[2])}</li>`);
      continue;
    }
    const unordered = trimmed.match(/^[-*]\s+(.+)$/);
    if (unordered) {
      flushParagraph();
      pushListItem(indent, false, `<li>${renderInline(unordered[1])}</li>`);
      continue;
    }
    const ordered = trimmed.match(/^\d+\.\s+(.+)$/);
    if (ordered) {
      flushParagraph();
      pushListItem(indent, true, `<li>${renderInline(ordered[1])}</li>`);
      continue;
    }
    flushLists();
    paragraph.push(line);
  }

  flushParagraph();
  flushLists();
  return blocks.join("");
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ESCAPE_MAP[char] || char);
}

export function firstLine(value: string): string {
  const line = value.trim().split(/\r?\n/).find(Boolean);
  return line ? stripMarkdownPrefix(line) : "未命名卡片";
}

function stripMarkdownPrefix(value: string): string {
  return value
    .trim()
    .replace(/^#{1,6}\s+/, "")
    .replace(/^>\s+/, "")
    .replace(/^[-*]\s+\[( |x|X)]\s+/, "")
    .replace(/^[-*]\s+/, "")
    .replace(/^\d+\.\s+/, "")
    .trim() || "未命名卡片";
}

function renderInline(value: string): string {
  const escaped = escapeHtml(value);
  const withImages = escaped.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" loading="lazy" />');
  const withBold = withImages.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  const withInlineCode = withBold.replace(/`([^`]+)`/g, "<code>$1</code>");
  return withInlineCode.replace(/(^|\s)#([^#\s][^#\n]*?)(#|\s|$)/g, '$1<span class="scn-md-tag">#$2</span>$3');
}

function renderReviewIdea(time: string, lines: string[]): string {
  const bodyLines = [...lines];
  while (bodyLines.length > 0 && !bodyLines[0].trim()) {
    bodyLines.shift();
  }
  while (bodyLines.length > 0 && !bodyLines[bodyLines.length - 1].trim()) {
    bodyLines.pop();
  }
  const body = bodyLines.map((line) => line.trim() ? renderInline(line) : "").join("<br />");
  return [
    '<section class="scn-review-idea">',
    `<div class="scn-review-idea__meta">回顾想法 · ${escapeHtml(time.trim())}</div>`,
    body ? `<div class="scn-review-idea__body">${body}</div>` : "",
    "</section>"
  ].join("");
}
