export interface CardNote {
  id: string;
  title?: string;
  content: string;
  tags: string[];
  manualTags?: string[];
  createdAt: number;
  updatedAt: number;
  pinned: boolean;
  boundBlockId?: string;
  syncedToDaily?: boolean;
  syncError?: string;
  lastSyncedAt?: number;
  lastSyncedMarkdown?: string;
  syncConflict?: CardSyncConflict;
}

export interface CardSyncConflict {
  detectedAt: number;
  remoteTitle: string;
  remoteContent: string;
  remoteMarkdown: string;
  localMarkdown: string;
  baseMarkdown?: string;
}

export interface PluginSettings {
  autoSyncToDaily: boolean;
  dailyNotebookId: string;
  viewMode: "list" | "card";
  sortMode: CardSortMode;
  dailyReviewEnabled: boolean;
  dailyReviewLimit: number;
}

export interface CardDraft {
  title: string;
  content: string;
}

export interface Notebook {
  id: string;
  name: string;
  closed?: boolean;
}

export interface AppApi {
  refresh(): Promise<void>;
}

export interface CardFilter {
  keyword: string;
  selectedTag: string;
  status: CardStatusFilter;
  time: CardTimeFilter;
}

export type CardStatusFilter = "all" | "synced" | "unsynced" | "error" | "pinned";
export type CardTimeFilter = "all" | "today" | "7d" | "30d";
export type CardSortMode = "createdDesc" | "createdAsc" | "updatedDesc" | "updatedAsc" | "pinned";

export interface CardNoteStorage {
  version: number;
  cards: CardNote[];
}

export interface CardReviewMeta {
  cardId: string;
  lastReviewedAt?: number;
  nextReviewAt?: number;
  reviewCount: number;
  skippedAt?: number;
  dismissedDate?: string;
  snoozedUntil?: number;
  priority?: number;
}

export interface DailyReviewRecord {
  date: string;
  cardIds: string[];
  completedIds: string[];
  dismissedIds: string[];
}

export interface ReviewState {
  version: number;
  cards: Record<string, CardReviewMeta>;
  daily: Record<string, DailyReviewRecord>;
}

export interface SettingsStorage {
  version: number;
  settings: PluginSettings;
}

export interface CardNoteBackup {
  id: string;
  reason: string;
  createdAt: number;
  version: number;
  cards: CardNote[];
  settings: PluginSettings;
}

export interface CardNoteExport {
  app: "CardNote";
  version: number;
  exportedAt: number;
  cards: CardNote[];
  settings: PluginSettings;
}
