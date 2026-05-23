import type { Plugin } from "siyuan";
import { BACKUP_STORAGE_KEY, CARD_STORAGE_KEY, DEFAULT_SETTINGS, MAX_BACKUPS, REVIEW_STORAGE_KEY, SETTINGS_STORAGE_KEY, STORAGE_VERSION } from "./constants";
import type { CardNote, CardNoteBackup, CardNoteExport, DailyReviewRecord, PluginSettings, ReviewState } from "./types";

export async function loadCards(plugin: Plugin): Promise<CardNote[]> {
  const value = await plugin.loadData(CARD_STORAGE_KEY);
  if (Array.isArray(value)) {
    return normalizeCards(value);
  }
  if (isRecord(value) && Array.isArray(value.cards)) {
    return normalizeCards(value.cards);
  }
  return [];
}

export async function saveCards(plugin: Plugin, cards: CardNote[]): Promise<void> {
  await plugin.saveData(CARD_STORAGE_KEY, {
    version: STORAGE_VERSION,
    cards: normalizeCards(cards)
  });
}

export async function loadSettings(plugin: Plugin): Promise<PluginSettings> {
  const value = await plugin.loadData(SETTINGS_STORAGE_KEY);
  if (isRecord(value) && isRecord(value.settings)) {
    return normalizeSettings(value.settings);
  }
  return normalizeSettings(value);
}

export async function saveSettings(plugin: Plugin, settings: PluginSettings): Promise<void> {
  await plugin.saveData(SETTINGS_STORAGE_KEY, {
    version: STORAGE_VERSION,
    settings: normalizeSettings(settings)
  });
}

export async function loadReviewState(plugin: Plugin): Promise<ReviewState> {
  return normalizeReviewState(await plugin.loadData(REVIEW_STORAGE_KEY));
}

export async function saveReviewState(plugin: Plugin, reviewState: ReviewState): Promise<void> {
  await plugin.saveData(REVIEW_STORAGE_KEY, normalizeReviewState(reviewState));
}

export async function loadBackups(plugin: Plugin): Promise<CardNoteBackup[]> {
  const value = await plugin.loadData(BACKUP_STORAGE_KEY);
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(isBackup).slice(0, MAX_BACKUPS);
}

export async function createBackup(plugin: Plugin, cards: CardNote[], settings: PluginSettings, reason: string): Promise<CardNoteBackup> {
  const backup: CardNoteBackup = {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    reason,
    createdAt: Date.now(),
    version: STORAGE_VERSION,
    cards: normalizeCards(cards),
    settings: normalizeSettings(settings)
  };
  const backups = [backup, ...await loadBackups(plugin)].slice(0, MAX_BACKUPS);
  await plugin.saveData(BACKUP_STORAGE_KEY, backups);
  return backup;
}

export function createExportPayload(cards: CardNote[], settings: PluginSettings): CardNoteExport {
  return {
    app: "CardNote",
    version: STORAGE_VERSION,
    exportedAt: Date.now(),
    cards: normalizeCards(cards),
    settings: normalizeSettings(settings)
  };
}

export function parseImportPayload(raw: unknown): CardNoteExport {
  if (Array.isArray(raw)) {
    return createExportPayload(normalizeCards(raw), { ...DEFAULT_SETTINGS });
  }

  if (!isRecord(raw)) {
    throw new Error("导入文件格式不正确。");
  }

  const cardsSource = Array.isArray(raw.cards) ? raw.cards : [];
  const settingsSource = isRecord(raw.settings) ? raw.settings : DEFAULT_SETTINGS;
  const cards = normalizeCards(cardsSource);

  if (cards.length === 0 && cardsSource.length > 0) {
    throw new Error("导入文件中没有可识别的卡片数据。");
  }

  return {
    app: "CardNote",
    version: typeof raw.version === "number" ? raw.version : STORAGE_VERSION,
    exportedAt: typeof raw.exportedAt === "number" ? raw.exportedAt : Date.now(),
    cards,
    settings: normalizeSettings(settingsSource)
  };
}

function normalizeCards(values: unknown[]): CardNote[] {
  return values.map(normalizeCard).filter((card): card is CardNote => Boolean(card));
}

function normalizeCard(value: unknown): CardNote | undefined {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.content !== "string") {
    return undefined;
  }
  const createdAt = typeof value.createdAt === "number" ? value.createdAt : Date.now();
  const updatedAt = typeof value.updatedAt === "number" ? value.updatedAt : createdAt;
  return {
    id: value.id,
    title: typeof value.title === "string" ? value.title : "",
    content: value.content,
    tags: Array.isArray(value.tags) ? value.tags.filter((tag): tag is string => typeof tag === "string") : [],
    manualTags: Array.isArray(value.manualTags) ? value.manualTags.filter((tag): tag is string => typeof tag === "string") : [],
    createdAt,
    updatedAt,
    pinned: typeof value.pinned === "boolean" ? value.pinned : false,
    boundBlockId: typeof value.boundBlockId === "string" ? value.boundBlockId : undefined,
    syncedToDaily: typeof value.syncedToDaily === "boolean" ? value.syncedToDaily : undefined,
    syncError: typeof value.syncError === "string" ? value.syncError : undefined,
    lastSyncedAt: typeof value.lastSyncedAt === "number" ? value.lastSyncedAt : undefined,
    lastSyncedMarkdown: typeof value.lastSyncedMarkdown === "string" ? value.lastSyncedMarkdown : undefined,
    syncConflict: normalizeSyncConflict(value.syncConflict)
  };
}

function normalizeSyncConflict(value: unknown): CardNote["syncConflict"] {
  if (!isRecord(value)) {
    return undefined;
  }
  return {
    detectedAt: typeof value.detectedAt === "number" ? value.detectedAt : Date.now(),
    remoteTitle: typeof value.remoteTitle === "string" ? value.remoteTitle : "",
    remoteContent: typeof value.remoteContent === "string" ? value.remoteContent : "",
    remoteMarkdown: typeof value.remoteMarkdown === "string" ? value.remoteMarkdown : "",
    localMarkdown: typeof value.localMarkdown === "string" ? value.localMarkdown : "",
    baseMarkdown: typeof value.baseMarkdown === "string" ? value.baseMarkdown : undefined
  };
}

function normalizeSettings(value: unknown): PluginSettings {
  if (!isRecord(value)) {
    return { ...DEFAULT_SETTINGS };
  }
  return {
    autoSyncToDaily: typeof value.autoSyncToDaily === "boolean" ? value.autoSyncToDaily : DEFAULT_SETTINGS.autoSyncToDaily,
    dailyNotebookId: typeof value.dailyNotebookId === "string" ? value.dailyNotebookId : DEFAULT_SETTINGS.dailyNotebookId,
    viewMode: value.viewMode === "card" ? "card" : "list",
    sortMode: normalizeSortMode(value.sortMode),
    dailyReviewEnabled: typeof value.dailyReviewEnabled === "boolean" ? value.dailyReviewEnabled : DEFAULT_SETTINGS.dailyReviewEnabled,
    dailyReviewLimit: normalizeReviewLimit(value.dailyReviewLimit)
  };
}

function normalizeSortMode(value: unknown): PluginSettings["sortMode"] {
  if (value === "createdAsc" || value === "updatedDesc" || value === "updatedAsc" || value === "pinned") {
    return value;
  }
  return DEFAULT_SETTINGS.sortMode;
}

function normalizeReviewLimit(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_SETTINGS.dailyReviewLimit;
  }
  return Math.max(1, Math.min(20, Math.round(value)));
}

function normalizeReviewState(value: unknown): ReviewState {
  if (!isRecord(value)) {
    return {
      version: STORAGE_VERSION,
      cards: {},
      daily: {}
    };
  }
  const cardsValue = isRecord(value.cards) ? value.cards : {};
  const dailyValue = isRecord(value.daily) ? value.daily : {};
  const cards: ReviewState["cards"] = {};
  const daily: ReviewState["daily"] = {};

  for (const [cardId, meta] of Object.entries(cardsValue)) {
    if (!isRecord(meta)) {
      continue;
    }
    cards[cardId] = {
      cardId,
      lastReviewedAt: typeof meta.lastReviewedAt === "number" ? meta.lastReviewedAt : undefined,
      lastShownAt: typeof meta.lastShownAt === "number" ? meta.lastShownAt : undefined,
      nextReviewAt: typeof meta.nextReviewAt === "number" ? meta.nextReviewAt : undefined,
      reviewCount: typeof meta.reviewCount === "number" ? Math.max(0, Math.round(meta.reviewCount)) : 0,
      skippedAt: typeof meta.skippedAt === "number" ? meta.skippedAt : undefined,
      dismissedDate: typeof meta.dismissedDate === "string" ? meta.dismissedDate : undefined,
      snoozedUntil: typeof meta.snoozedUntil === "number" ? meta.snoozedUntil : undefined,
      priority: typeof meta.priority === "number" ? meta.priority : undefined
    };
  }

  for (const [date, record] of Object.entries(dailyValue)) {
    const normalized = normalizeDailyReviewRecord(date, record);
    if (normalized) {
      daily[date] = normalized;
    }
  }

  return {
    version: typeof value.version === "number" ? value.version : STORAGE_VERSION,
    cards,
    daily
  };
}

function normalizeDailyReviewRecord(date: string, value: unknown): DailyReviewRecord | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  return {
    date: typeof value.date === "string" ? value.date : date,
    cardIds: Array.isArray(value.cardIds) ? value.cardIds.filter((id): id is string => typeof id === "string") : [],
    completedIds: Array.isArray(value.completedIds) ? value.completedIds.filter((id): id is string => typeof id === "string") : [],
    dismissedIds: Array.isArray(value.dismissedIds) ? value.dismissedIds.filter((id): id is string => typeof id === "string") : []
  };
}

function isBackup(value: unknown): value is CardNoteBackup {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.reason === "string" &&
    typeof value.createdAt === "number" &&
    typeof value.version === "number" &&
    Array.isArray(value.cards) &&
    isRecord(value.settings)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
