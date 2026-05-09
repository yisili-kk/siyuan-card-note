import type { CardNote } from "./types";

const TAG_CONTROL_CHARS = /[\u200B-\u200D\uFEFF]/g;

function stripTagControlChars(value: string): string {
  return value.replace(TAG_CONTROL_CHARS, "");
}

export function buildDailyMarkdown(card: CardNote): string {
  const timestamp = formatDateTime(card.createdAt);
  const normalizedTitle = normalizeTitle(card.title);
  const title = normalizedTitle ? `${timestamp} ${normalizedTitle}` : timestamp;
  const content = normalizeSiyuanTags(card.content.trim());
  if (!content) {
    return `- ${title}`;
  }
  return `- ${title}\n\n${indentMarkdown(content)}`;
}

function normalizeTitle(value: string | undefined): string {
  return stripTagControlChars(value || "").replace(/\s+/g, " ").trim();
}

function indentMarkdown(markdown: string): string {
  return markdown.split(/\r?\n/).map((line) => line ? `  ${line}` : "  ").join("\n");
}

function normalizeSiyuanTags(markdown: string): string {
  return stripTagControlChars(markdown).replace(/(^|\s)#([^#\s][^#\n]*?)(#|\s|$)/g, (_match, prefix: string, tag: string, suffix: string) => {
    const normalized = tag.replace(/[，。！？；：,.!?;:]$/u, "").trim();
    const trailing = suffix === "#" ? "" : suffix;
    return normalized ? `${prefix}#${normalized}#${trailing}` : _match;
  });
}

function formatDateTime(timestamp: number): string {
  const date = new Date(timestamp);
  const pad = (value: number) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate())
  ].join("-") + ` ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}
