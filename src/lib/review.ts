import type { CardNote, DailyReviewRecord, PluginSettings, ReviewState } from "./types";

export type ReviewAction = "reviewed" | "later" | "dismissToday";

const DAY = 24 * 60 * 60 * 1000;
const REVIEW_INTERVAL_DAYS = [1, 3, 7, 14, 30, 60];
const MAX_DAILY_RECORDS = 21;

export interface DailyReviewDraft {
  state: ReviewState;
  changed: boolean;
}

export interface DailyReviewProgress {
  total: number;
  completed: number;
}

export function createEmptyReviewState(): ReviewState {
  return {
    version: 1,
    cards: {},
    daily: {}
  };
}

export function ensureDailyReview(cards: CardNote[], state: ReviewState, settings: PluginSettings, now = Date.now()): DailyReviewDraft {
  const cardIds = new Set(cards.map((card) => card.id));
  let nextState = cloneReviewState(state);
  let changed = cleanupReviewState(nextState, cardIds, now);
  const date = toLocalDateKey(now);

  if (!settings.dailyReviewEnabled) {
    return { state: nextState, changed };
  }

  const limit = clampReviewLimit(settings.dailyReviewLimit);
  const existing = nextState.daily[date];
  if (existing) {
    const normalized = trimRecord(normalizeRecord(existing, cardIds), limit);
    const shouldRefill = normalized.cardIds.length < limit;
    if (!sameRecord(existing, normalized)) {
      nextState.daily[date] = normalized;
      changed = true;
    }
    if (shouldRefill) {
      const filled = fillDailyRecord(normalized, cards, nextState, limit, now);
      if (!sameRecord(nextState.daily[date], filled)) {
        nextState.daily[date] = filled;
        changed = true;
      }
    }
    return { state: nextState, changed };
  }

  nextState.daily[date] = fillDailyRecord({
    date,
    cardIds: [],
    completedIds: [],
    dismissedIds: []
  }, cards, nextState, limit, now);
  changed = true;
  return { state: nextState, changed };
}

export function getDailyReviewCards(cards: CardNote[], state: ReviewState, settings: PluginSettings, now = Date.now()): CardNote[] {
  if (!settings.dailyReviewEnabled) {
    return [];
  }
  const record = state.daily[toLocalDateKey(now)];
  if (!record) {
    return [];
  }
  const byId = new Map(cards.map((card) => [card.id, card]));
  const hiddenIds = new Set([...record.completedIds, ...record.dismissedIds]);
  return record.cardIds
    .filter((id) => !hiddenIds.has(id))
    .map((id) => byId.get(id))
    .filter((card): card is CardNote => Boolean(card));
}

export function getDailyReviewProgress(state: ReviewState, now = Date.now()): DailyReviewProgress {
  const record = state.daily[toLocalDateKey(now)];
  if (!record) {
    return { total: 0, completed: 0 };
  }
  return {
    total: record.cardIds.length,
    completed: record.cardIds.filter((id) => record.completedIds.includes(id)).length
  };
}

export function applyReviewAction(state: ReviewState, cardId: string, action: ReviewAction, now = Date.now()): ReviewState {
  const date = toLocalDateKey(now);
  const nextState = cloneReviewState(state);
  const record = nextState.daily[date] || {
    date,
    cardIds: [cardId],
    completedIds: [],
    dismissedIds: []
  };
  const meta = nextState.cards[cardId] || {
    cardId,
    reviewCount: 0
  };

  if (action === "reviewed") {
    const reviewCount = meta.reviewCount + 1;
    nextState.cards[cardId] = {
      ...meta,
      reviewCount,
      lastReviewedAt: now,
      nextReviewAt: now + nextIntervalDays(reviewCount) * DAY,
      skippedAt: undefined,
      dismissedDate: undefined,
      snoozedUntil: undefined
    };
    nextState.daily[date] = {
      ...record,
      cardIds: includeId(record.cardIds, cardId),
      completedIds: includeId(record.completedIds, cardId),
      dismissedIds: record.dismissedIds.filter((id) => id !== cardId)
    };
    return nextState;
  }

  if (action === "later") {
    nextState.cards[cardId] = {
      ...meta,
      skippedAt: now,
      snoozedUntil: startOfNextDay(now)
    };
    nextState.daily[date] = {
      ...record,
      cardIds: includeId(record.cardIds, cardId),
      completedIds: record.completedIds.filter((id) => id !== cardId),
      dismissedIds: includeId(record.dismissedIds, cardId)
    };
    return nextState;
  }

  nextState.cards[cardId] = {
    ...meta,
    dismissedDate: date
  };
  nextState.daily[date] = {
    ...record,
    cardIds: includeId(record.cardIds, cardId),
    completedIds: record.completedIds.filter((id) => id !== cardId),
    dismissedIds: includeId(record.dismissedIds, cardId)
  };
  return nextState;
}

export function getReviewReason(card: CardNote, state: ReviewState, now = Date.now()): string {
  const meta = state.cards[card.id];
  if (!meta?.lastReviewedAt) {
    return card.createdAt >= startOfDay(now) ? "新卡片" : "首次回顾";
  }
  const days = Math.max(1, Math.floor((now - meta.lastReviewedAt) / DAY));
  return `${days} 天未看`;
}

export function appendReviewIdeaToContent(content: string, idea: string, now = Date.now()): string {
  const normalizedIdea = idea.trim();
  if (!normalizedIdea) {
    return content.trim();
  }
  const body = normalizedIdea
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .map((line) => line ? `> ${line}` : ">")
    .join("\n");
  const reviewBlock = `> 回顾想法 ${formatMinute(now)}\n${body}`;
  return [content.trim(), reviewBlock].filter(Boolean).join("\n\n");
}

export function toLocalDateKey(value: number): string {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function fillDailyRecord(record: DailyReviewRecord, cards: CardNote[], state: ReviewState, limit: number, now: number): DailyReviewRecord {
  const picked = new Set(record.cardIds);
  const hidden = new Set([...record.completedIds, ...record.dismissedIds]);
  const candidates = cards
    .filter((card) => !picked.has(card.id))
    .filter((card) => isReviewCandidate(card, state, hidden, now))
    .sort((a, b) => scoreCard(b, state, now) - scoreCard(a, state, now));
  const cardIds = [...record.cardIds];
  for (const card of candidates) {
    if (cardIds.length >= limit) {
      break;
    }
    cardIds.push(card.id);
  }
  return {
    ...record,
    cardIds: cardIds.slice(0, limit)
  };
}

function isReviewCandidate(card: CardNote, state: ReviewState, hidden: Set<string>, now: number): boolean {
  if (hidden.has(card.id)) {
    return false;
  }
  if (!card.title?.trim() && !card.content.trim()) {
    return false;
  }
  const meta = state.cards[card.id];
  if (meta?.dismissedDate === toLocalDateKey(now)) {
    return false;
  }
  if (meta?.snoozedUntil && meta.snoozedUntil > now) {
    return false;
  }
  if (meta?.nextReviewAt) {
    return meta.nextReviewAt <= now;
  }
  return card.createdAt < startOfDay(now);
}

function scoreCard(card: CardNote, state: ReviewState, now: number): number {
  const meta = state.cards[card.id];
  const ageDays = Math.max(0, Math.floor((now - card.createdAt) / DAY));
  const reviewAgeDays = meta?.lastReviewedAt ? Math.floor((now - meta.lastReviewedAt) / DAY) : ageDays + 2;
  const overdueDays = meta?.nextReviewAt ? Math.max(0, Math.floor((now - meta.nextReviewAt) / DAY)) : 0;
  return reviewAgeDays * 8 + overdueDays * 4 + (card.pinned ? 18 : 0) + Math.min(ageDays, 30) + (meta?.priority || 0);
}

function cleanupReviewState(state: ReviewState, cardIds: Set<string>, now: number): boolean {
  let changed = false;
  for (const cardId of Object.keys(state.cards)) {
    if (!cardIds.has(cardId)) {
      delete state.cards[cardId];
      changed = true;
    }
  }
  const dates = Object.keys(state.daily).sort((a, b) => b.localeCompare(a));
  for (const date of dates) {
    const record = normalizeRecord(state.daily[date], cardIds);
    if (!sameRecord(state.daily[date], record)) {
      state.daily[date] = record;
      changed = true;
    }
  }
  for (const date of dates.slice(MAX_DAILY_RECORDS)) {
    delete state.daily[date];
    changed = true;
  }
  const today = toLocalDateKey(now);
  for (const meta of Object.values(state.cards)) {
    if (meta.dismissedDate && meta.dismissedDate < today) {
      meta.dismissedDate = undefined;
      changed = true;
    }
  }
  return changed;
}

function normalizeRecord(record: DailyReviewRecord, cardIds: Set<string>): DailyReviewRecord {
  return {
    ...record,
    cardIds: record.cardIds.filter((id) => cardIds.has(id)),
    completedIds: record.completedIds.filter((id) => cardIds.has(id)),
    dismissedIds: record.dismissedIds.filter((id) => cardIds.has(id))
  };
}

function trimRecord(record: DailyReviewRecord, limit: number): DailyReviewRecord {
  const cardIds = record.cardIds.slice(0, limit);
  const kept = new Set(cardIds);
  return {
    ...record,
    cardIds,
    completedIds: record.completedIds.filter((id) => kept.has(id)),
    dismissedIds: record.dismissedIds.filter((id) => kept.has(id))
  };
}

function cloneReviewState(state: ReviewState): ReviewState {
  const cards: ReviewState["cards"] = {};
  const daily: ReviewState["daily"] = {};
  for (const [cardId, meta] of Object.entries(state.cards || {})) {
    cards[cardId] = { ...meta };
  }
  for (const [date, record] of Object.entries(state.daily || {})) {
    daily[date] = {
      date: record.date,
      cardIds: [...record.cardIds],
      completedIds: [...record.completedIds],
      dismissedIds: [...record.dismissedIds]
    };
  }
  return {
    version: state.version,
    cards,
    daily
  };
}

function sameRecord(a: DailyReviewRecord | undefined, b: DailyReviewRecord): boolean {
  if (!a) {
    return false;
  }
  return (
    a.date === b.date &&
    sameArray(a.cardIds, b.cardIds) &&
    sameArray(a.completedIds, b.completedIds) &&
    sameArray(a.dismissedIds, b.dismissedIds)
  );
}

function sameArray(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function includeId(values: string[], id: string): string[] {
  return values.includes(id) ? values : [...values, id];
}

function nextIntervalDays(reviewCount: number): number {
  return REVIEW_INTERVAL_DAYS[Math.min(reviewCount - 1, REVIEW_INTERVAL_DAYS.length - 1)];
}

function clampReviewLimit(value: number): number {
  return Math.max(1, Math.min(20, Math.round(value || 5)));
}

function startOfDay(value: number): number {
  const date = new Date(value);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function startOfNextDay(value: number): number {
  return startOfDay(value) + DAY;
}

function formatMinute(timestamp: number): string {
  const date = new Date(timestamp);
  const pad = (value: number) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate())
  ].join("-") + ` ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
