import type { CardNote, CardSortMode, CardStatusFilter, CardTimeFilter } from "./types";

const TAG_CONTROL_CHARS = /[\u200B-\u200D\uFEFF]/g;
const HASH_TAG = /(?:^|\s)#([^#\s][^#\n]*?)(?:#|\s|$)/g;

export function stripTagControlChars(value: string): string {
  return value.replace(TAG_CONTROL_CHARS, "");
}

export function extractTags(content: string): string[] {
  const tags = new Set<string>();
  for (const match of stripTagControlChars(content).matchAll(HASH_TAG)) {
    const tag = normalizeTag(match[1]);
    if (tag) {
      tags.add(tag);
    }
  }
  return [...tags].sort((a, b) => a.localeCompare(b));
}

export function mergeTags(...tagGroups: Array<Iterable<string> | undefined>): string[] {
  const tags = new Set<string>();
  for (const group of tagGroups) {
    if (!group) {
      continue;
    }
    for (const value of group) {
      const tag = normalizeTag(value);
      if (tag) {
        tags.add(tag);
      }
    }
  }
  return [...tags].sort((a, b) => a.localeCompare(b));
}

export function parseTagInput(input: string): string[] {
  const fromHash = extractTags(input);
  const fromSeparators = input
    .split(/[\s,，;；]+/)
    .map((tag) => normalizeTag(tag))
    .filter(Boolean);
  return mergeTags(fromHash, fromSeparators);
}

export function buildCardTags(title: string, content: string): string[] {
  return extractTags(`${title}\n${content}`);
}

export function getCardTags(card: CardNote): string[] {
  return buildCardTags(card.title || "", card.content);
}

export function getAllTags(cards: CardNote[]): string[] {
  const tags = new Set<string>();
  for (const card of cards) {
    for (const tag of getCardTags(card)) {
      if (tag) {
        tags.add(tag);
      }
    }
  }
  return [...tags].sort((a, b) => a.localeCompare(b));
}

export function filterCards(cards: CardNote[], keyword: string, selectedTag: string, status: CardStatusFilter, time: CardTimeFilter, sortMode: CardSortMode): CardNote[] {
  const lowered = keyword.trim().toLocaleLowerCase();
  return cards
    .filter((card) => {
      const tags = getCardTags(card);
      const matchesKeyword = !lowered || card.content.toLocaleLowerCase().includes(lowered) || (card.title || "").toLocaleLowerCase().includes(lowered) || tags.some((tag) => tag.toLocaleLowerCase().includes(lowered));
      const matchesTag = !selectedTag || tags.includes(selectedTag);
      const matchesStatus = matchStatus(card, status);
      const matchesTime = matchTime(card, time);
      return matchesKeyword && matchesTag && matchesStatus && matchesTime;
    })
    .sort((a, b) => compareCards(a, b, sortMode));
}

function matchTime(card: CardNote, time: CardTimeFilter): boolean {
  if (time === "all") {
    return true;
  }
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (time === "today") {
    return card.createdAt >= start;
  }
  const days = time === "7d" ? 7 : 30;
  return card.createdAt >= Date.now() - days * 24 * 60 * 60 * 1000;
}

export function normalizeTag(tag: string): string {
  return stripTagControlChars(tag).replace(/^#+|#+$/g, "").replace(/[，。！？；：,.!?;:]$/u, "").trim();
}

export function replaceTagInMarkdown(markdown: string, from: string, to: string): string {
  const source = normalizeTag(from);
  const target = normalizeTag(to);
  if (!source || !target) {
    return markdown;
  }
  const pattern = new RegExp(`(^|[\\s\\u200B-\\u200D\\uFEFF])#${escapeRegExp(source)}([，。！？；：,.!?;:]?)(#|(?=\\s|$))`, "gu");
  return stripTagControlChars(markdown).replace(pattern, (_match, prefix: string, punctuation: string) => `${prefix}#${target}#${punctuation}`);
}

export function removeTagFromMarkdown(markdown: string, tag: string): string {
  const source = normalizeTag(tag);
  if (!source) {
    return markdown;
  }
  const pattern = new RegExp(`(^|[\\s\\u200B-\\u200D\\uFEFF])#${escapeRegExp(source)}[，。！？；：,.!?;:]?(#|(?=\\s|$))`, "gu");
  return stripTagControlChars(markdown).replace(pattern, "$1").replace(/[ \t]{2,}/g, " ");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function matchStatus(card: CardNote, status: CardStatusFilter): boolean {
  if (status === "synced") {
    return Boolean(card.boundBlockId && !card.syncError);
  }
  if (status === "unsynced") {
    return !card.boundBlockId;
  }
  if (status === "error") {
    return Boolean(card.syncError);
  }
  if (status === "pinned") {
    return card.pinned;
  }
  return true;
}

function compareCards(a: CardNote, b: CardNote, sortMode: CardSortMode): number {
  if (sortMode === "createdAsc") {
    return a.createdAt - b.createdAt;
  }
  if (sortMode === "updatedDesc") {
    return b.updatedAt - a.updatedAt;
  }
  if (sortMode === "updatedAsc") {
    return a.updatedAt - b.updatedAt;
  }
  if (sortMode === "pinned") {
    return Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt;
  }
  return Number(b.pinned) - Number(a.pinned) || b.createdAt - a.createdAt;
}
