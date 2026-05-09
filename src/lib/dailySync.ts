import { CARD_ATTRS } from "./constants";
import { detectDailyBlockConflict, toSyncConflict } from "./dailyBlock";
import { buildDailyMarkdown } from "./dailyMarkdown";
import type { CardNote, CardSyncConflict, PluginSettings } from "./types";
import type { SiYuanApi } from "./siyuanApi";

export class DailySyncConflictError extends Error {
  constructor(readonly conflict: CardSyncConflict) {
    super("检测到思源日记块已被修改，请先回读或手动处理冲突。");
    this.name = "DailySyncConflictError";
  }
}

export async function syncCardToDaily(api: SiYuanApi, card: CardNote, settings: PluginSettings, options: { force?: boolean } = {}): Promise<CardNote> {
  if (!settings.dailyNotebookId) {
    throw new Error("请先在设置中选择日记笔记本。");
  }

  const markdown = buildDailyMarkdown(card);
  let boundBlockId = card.boundBlockId || "";

  if (boundBlockId) {
    const exists = await api.blockExists(boundBlockId);
    if (exists) {
      if (!options.force) {
        const conflict = await detectDailyBlockConflict(api, card);
        if (conflict.conflicted) {
          throw new DailySyncConflictError(toSyncConflict(conflict));
        }
      }
      await withRetry(() => api.updateBlock(boundBlockId, markdown));
    } else {
      boundBlockId = "";
    }
  }

  if (!boundBlockId) {
    boundBlockId = await withRetry(() => api.appendDailyNoteBlock(settings.dailyNotebookId, markdown));
    if (!boundBlockId) {
      throw new Error("已写入日记，但没有获取到块 ID。");
    }
  }

  await withRetry(() => api.setBlockAttrs(boundBlockId, buildCardAttrs(card)));
  return {
    ...card,
    boundBlockId,
    syncedToDaily: true,
    syncError: undefined,
    syncConflict: undefined,
    lastSyncedAt: Date.now(),
    lastSyncedMarkdown: markdown
  };
}

async function withRetry<T>(operation: () => Promise<T>, attempts = 2): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt < attempts - 1) {
        await delay(250);
      }
    }
  }
  throw lastError;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function buildCardAttrs(card: CardNote): Record<string, string> {
  return {
    [CARD_ATTRS.id]: card.id,
    [CARD_ATTRS.title]: card.title || "",
    [CARD_ATTRS.content]: card.content,
    [CARD_ATTRS.tags]: card.tags.join(","),
    [CARD_ATTRS.created]: String(card.createdAt)
  };
}
