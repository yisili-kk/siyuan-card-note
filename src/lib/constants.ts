export const TAB_TYPE = "card-note-tab";
export const STORAGE_VERSION = 1;
export const CARD_STORAGE_KEY = "cardnote-cards";
export const SETTINGS_STORAGE_KEY = "cardnote-settings";
export const BACKUP_STORAGE_KEY = "cardnote-backups";
export const REVIEW_STORAGE_KEY = "cardnote-review";
export const MAX_BACKUPS = 10;

export const DEFAULT_SETTINGS = {
  autoSyncToDaily: false,
  dailyNotebookId: "",
  viewMode: "list" as const,
  sortMode: "createdDesc" as const,
  dailyReviewEnabled: true,
  dailyReviewLimit: 5
};

export const CARD_ATTRS = {
  id: "custom-cardnote-id",
  title: "custom-cardnote-title",
  content: "custom-cardnote-content",
  tags: "custom-cardnote-tags",
  created: "custom-cardnote-created"
};
