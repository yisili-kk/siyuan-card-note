import { buildDailyMarkdown } from "./dailyMarkdown";
import type { CardNote, CardSyncConflict } from "./types";
import type { SiYuanApi } from "./siyuanApi";

const TAG_CONTROL_CHARS = /[\u200B-\u200D\uFEFF]/g;

function stripTagControlChars(value: string): string {
  return value.replace(TAG_CONTROL_CHARS, "");
}

export interface DailyBlockDraft {
  title: string;
  content: string;
  markdown: string;
}

export interface DailyBlockConflictResult {
  conflicted: boolean;
  remote: DailyBlockDraft;
  localMarkdown: string;
  baseMarkdown?: string;
}

export async function readCardFromDailyBlock(api: SiYuanApi, card: CardNote): Promise<DailyBlockDraft> {
  if (!card.boundBlockId) {
    throw new Error("这张卡片还没有绑定日记块。");
  }
  const kramdown = await api.getBlockKramdown(card.boundBlockId);
  const parsed = parseDailyBlock(kramdown);
  return {
    ...parsed,
    markdown: buildDailyMarkdown({
      ...card,
      title: parsed.title,
      content: parsed.content
    })
  };
}

export async function detectDailyBlockConflict(api: SiYuanApi, card: CardNote): Promise<DailyBlockConflictResult> {
  const remote = await readCardFromDailyBlock(api, card);
  const localMarkdown = normalizeMarkdown(buildDailyMarkdown(card));
  const remoteMarkdown = normalizeMarkdown(remote.markdown);
  const baseMarkdown = card.lastSyncedMarkdown ? normalizeMarkdown(card.lastSyncedMarkdown) : undefined;
  const conflicted = remoteMarkdown !== localMarkdown && (!baseMarkdown || remoteMarkdown !== baseMarkdown);
  return {
    conflicted,
    remote,
    localMarkdown,
    baseMarkdown
  };
}

export function toSyncConflict(result: DailyBlockConflictResult): CardSyncConflict {
  return {
    detectedAt: Date.now(),
    remoteTitle: result.remote.title,
    remoteContent: result.remote.content,
    remoteMarkdown: result.remote.markdown,
    localMarkdown: result.localMarkdown,
    baseMarkdown: result.baseMarkdown
  };
}

export function normalizeMarkdown(markdown: string): string {
  return stripKramdownAttrs(markdown)
    .split(/\r?\n/)
    .map((line) => line.replace(/[ \t]+$/g, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function parseDailyBlock(kramdown: string): Omit<DailyBlockDraft, "markdown"> {
  const lines = stripKramdownAttrs(kramdown).split(/\r?\n/);
  const firstIndex = lines.findIndex((line) => line.trim());
  if (firstIndex < 0) {
    return { title: "", content: "" };
  }

  const firstLine = lines[firstIndex].trim();
  const titleLine = firstLine.replace(/^[-*]\s+/, "").trim();
  const title = stripTimestamp(titleLine);
  const contentLines = lines.slice(firstIndex + 1);
  while (contentLines.length > 0 && !contentLines[0].trim()) {
    contentLines.shift();
  }

  return {
    title,
    content: unindentListContent(contentLines).trim()
  };
}

function stripTimestamp(value: string): string {
  return value.replace(/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\s*/, "").trim();
}

function unindentListContent(lines: string[]): string {
  return lines.map((line) => {
    if (line.startsWith("  ")) {
      return line.slice(2);
    }
    if (line.startsWith("\t")) {
      return line.slice(1);
    }
    return line;
  }).join("\n");
}

export function stripKramdownAttrs(markdown: string): string {
  return stripTagControlChars(markdown)
    .split(/\r?\n/)
    .map((line) => line.replace(/\{:\s+[^}]+}\s*/g, "").replace(/[ \t]+$/g, ""))
    .filter((line) => line.trim() || !/^\s*\{:\s+[^}]+}\s*$/.test(line))
    .join("\n");
}
