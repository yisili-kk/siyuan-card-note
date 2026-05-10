<script lang="ts">
  import type { Plugin } from "siyuan";
  import { confirm, openTab, showMessage } from "siyuan";
  import CaptureBox from "./components/CaptureBox.svelte";
  import CardDetail from "./components/CardDetail.svelte";
  import CardList from "./components/CardList.svelte";
  import DailyReviewStrip from "./components/DailyReviewStrip.svelte";
  import ImagePreview from "./components/ImagePreview.svelte";
  import SettingsPanel from "./components/SettingsPanel.svelte";
  import Sidebar from "./components/Sidebar.svelte";
  import { DEFAULT_SETTINGS } from "./lib/constants";
  import { detectDailyBlockConflict, normalizeMarkdown, readCardFromDailyBlock, stripKramdownAttrs, toSyncConflict } from "./lib/dailyBlock";
  import type { DailyBlockConflictResult, DailyBlockDraft } from "./lib/dailyBlock";
  import { buildDailyMarkdown } from "./lib/dailyMarkdown";
  import { DailySyncConflictError, syncCardToDaily } from "./lib/dailySync";
  import { appendReviewIdeaToContent, applyReviewAction, createEmptyReviewState, ensureDailyReview, getDailyReviewCards, getDailyReviewProgress } from "./lib/review";
  import { SiYuanApi } from "./lib/siyuanApi";
  import { createBackup, createExportPayload, loadBackups, loadCards, loadReviewState, loadSettings, parseImportPayload, saveCards, saveReviewState, saveSettings } from "./lib/storage";
  import { buildCardTags, filterCards, getAllTags, normalizeTag, removeTagFromMarkdown, replaceTagInMarkdown, stripTagControlChars } from "./lib/tagService";
  import type { CardDraft, CardNote, CardStatusFilter, CardTimeFilter, Notebook, PluginSettings, ReviewState } from "./lib/types";

  export let plugin: Plugin;

  const api = new SiYuanApi();

  interface AutoSyncSummary {
    cards: CardNote[];
    pulled: number;
    pushed: number;
    conflicts: number;
    missing: number;
  }

  let cards: CardNote[] = [];
  let settings: PluginSettings = { ...DEFAULT_SETTINGS };
  let reviewState: ReviewState = createEmptyReviewState();
  let notebooks: Notebook[] = [];
  let keyword = "";
  let selectedTag = "";
  let statusFilter: CardStatusFilter = "all";
  let timeFilter: CardTimeFilter = "all";
  let showSettings = false;
  let editingCard: CardNote | undefined;
  let detailCard: CardNote | undefined;
  let previewImageSrc = "";
  let backupCount = 0;
  let busy = false;
  let error = "";

  $: tags = getAllTags(cards);
  $: filteredCards = filterCards(cards, keyword, selectedTag, statusFilter, timeFilter, settings.sortMode);
  $: todayReviewCards = getDailyReviewCards(cards, reviewState, settings);
  $: todayReviewProgress = getDailyReviewProgress(reviewState);

  async function initialize() {
    busy = true;
    error = "";
    try {
      const [loadedCards, loadedSettings, loadedNotebooks, loadedBackups, loadedReviewState] = await Promise.all([
        loadCards(plugin),
        loadSettings(plugin),
        api.lsNotebooks().catch(() => []),
        loadBackups(plugin),
        loadReviewState(plugin)
      ]);
      const nextSettings = applyNotebookDefault(loadedSettings, loadedNotebooks);
      const normalizedCards = loadedCards.map((card) => normalizeCardTags(card));
      const autoSynced = await autoSyncBoundCards(normalizedCards, nextSettings);
      const reviewDraft = ensureDailyReview(autoSynced.cards, loadedReviewState, nextSettings);
      cards = autoSynced.cards;
      notebooks = loadedNotebooks;
      backupCount = loadedBackups.length;
      settings = nextSettings;
      reviewState = reviewDraft.state;
      await saveCards(plugin, cards);
      await saveSettings(plugin, settings);
      if (reviewDraft.changed) {
        await saveReviewState(plugin, reviewState);
      }
    } catch (err) {
      reportError(err);
    } finally {
      busy = false;
    }
  }

  export async function refresh() {
    await initialize();
  }

  function applyNotebookDefault(value: PluginSettings, notebookList: Notebook[]): PluginSettings {
    if (value.dailyNotebookId || notebookList.length === 0) {
      return value;
    }
    return {
      ...value,
      dailyNotebookId: notebookList[0].id
    };
  }

  async function uploadImage(file: File): Promise<string> {
    return api.uploadAsset(file);
  }

  async function createCard(event: CustomEvent<CardDraft>) {
    const title = normalizeTitle(event.detail.title);
    const content = event.detail.content.trim();
    if (!title && !content) {
      showMessage("请输入标题或卡片内容", 3000);
      return;
    }

    const now = Date.now();
    let card: CardNote = {
      id: createId(),
      title,
      content,
      tags: buildCardTags(title, content),
      createdAt: now,
      updatedAt: now,
      pinned: false
    };

    busy = true;
    error = "";
    try {
      cards = [card, ...cards];
      await saveCards(plugin, cards);
      if (settings.autoSyncToDaily) {
        try {
          card = await syncCardToDaily(api, card, settings);
          cards = cards.map((item) => item.id === card.id ? card : item);
          await saveCards(plugin, cards);
        } catch (syncErr) {
          const message = syncErr instanceof Error ? syncErr.message : String(syncErr);
          cards = cards.map((item) => item.id === card.id ? { ...item, syncError: message, syncedToDaily: false } : item);
          await saveCards(plugin, cards);
          reportError(syncErr);
          return;
        }
      }
      showMessage("已保存卡片");
      await refreshDailyReview();
    } catch (err) {
      reportError(err);
      cards = cards.filter((item) => item.id !== card.id);
      await saveCards(plugin, cards).catch(() => undefined);
    } finally {
      busy = false;
    }
  }

  async function updateCard(event: CustomEvent<{ card: CardNote; draft: CardDraft }>) {
    await updateCardContent(event.detail.card, event.detail.draft);
  }

  async function updateCardContent(card: CardNote, draft: CardDraft) {
    const updated: CardNote = {
      ...card,
      title: normalizeTitle(draft.title),
      content: draft.content.trim(),
      manualTags: [],
      tags: buildCardTags(draft.title, draft.content),
      updatedAt: Date.now()
    };
    busy = true;
    error = "";
    try {
      let finalCard = updated;
      if (updated.boundBlockId) {
        try {
          finalCard = await syncCardToDaily(api, updated, settings);
        } catch (syncErr) {
          finalCard = applySyncIssueToCard(updated, syncErr);
          reportError(syncErr);
        }
      }
      cards = cards.map((item) => item.id === finalCard.id ? finalCard : item);
      await saveCards(plugin, cards);
      await refreshDailyReview();
      editingCard = undefined;
      showMessage("卡片已更新");
    } catch (err) {
      reportError(err);
    } finally {
      busy = false;
    }
  }

  async function syncCard(event: CustomEvent<CardNote>) {
    const card = event.detail;
    busy = true;
    error = "";
    try {
      const synced = await syncCardToDaily(api, card, settings);
      cards = cards.map((item) => item.id === synced.id ? synced : item);
      await saveCards(plugin, cards);
      await refreshDailyReview();
      showMessage("已同步到今日日记");
    } catch (err) {
      await applySyncIssue(card, err);
    } finally {
      busy = false;
    }
  }

  async function readBackCard(event: CustomEvent<CardNote>) {
    await readBackCardValue(event.detail);
  }

  async function readBackCardValue(card: CardNote, options: { silent?: boolean } = {}) {
    if (!card.boundBlockId) {
      showMessage("这张卡片还没有绑定日记块。", 3000);
      return;
    }
    busy = true;
    error = "";
    try {
      const remote = await readCardFromDailyBlock(api, card);
      const updated: CardNote = {
        ...card,
        title: normalizeTitle(remote.title),
        content: remote.content.trim(),
        manualTags: [],
        tags: buildCardTags(remote.title, remote.content),
        updatedAt: Date.now(),
        syncedToDaily: true,
        syncError: undefined,
        syncConflict: undefined,
        lastSyncedAt: Date.now(),
        lastSyncedMarkdown: remote.markdown
      };
      cards = cards.map((item) => item.id === updated.id ? updated : item);
      if (detailCard?.id === updated.id) {
        detailCard = updated;
      }
      if (editingCard?.id === updated.id) {
        editingCard = updated;
      }
      await saveCards(plugin, cards);
      await refreshDailyReview();
      if (!options.silent) {
        showMessage("已从日记块回读内容");
      }
    } catch (err) {
      reportError(err);
    } finally {
      busy = false;
    }
  }

  async function togglePin(event: CustomEvent<CardNote>) {
    const card = event.detail;
    cards = cards.map((item) => item.id === card.id ? { ...item, pinned: !item.pinned, updatedAt: Date.now() } : item);
    await saveCards(plugin, cards);
    await refreshDailyReview();
  }

  async function renameTag(event: CustomEvent<{ from: string; to: string }>) {
    const from = normalizeTag(event.detail.from);
    const to = normalizeTag(event.detail.to);
    if (!from || !to) {
      showMessage("请输入有效标签", 3000, "error");
      return;
    }
    busy = true;
    error = "";
    try {
      const renamed = cards.map((card) => replaceTag(card, from, to));
      const synced = await Promise.all(renamed.map(async (card) => {
        if (!card.boundBlockId) {
          return card;
        }
        try {
          return await syncCardToDaily(api, card, settings);
        } catch (syncErr) {
          return applySyncIssueToCard(card, syncErr);
        }
      }));
      cards = synced;
      selectedTag = selectedTag === from ? to : selectedTag;
      await saveCards(plugin, cards);
      await refreshDailyReview();
      showMessage(from === to ? "标签已合并" : "标签已重命名");
    } catch (err) {
      reportError(err);
    } finally {
      busy = false;
    }
  }

  async function deleteTag(event: CustomEvent<string>) {
    const tag = normalizeTag(event.detail);
    if (!tag) {
      return;
    }
    confirm("删除标签", `将从所有卡片正文中移除 #${tag}。`, async () => {
      busy = true;
      error = "";
      try {
        const removed = cards.map((card) => removeTag(card, tag));
        const synced = await Promise.all(removed.map(async (card) => {
          if (!card.boundBlockId) {
            return card;
          }
          try {
            return await syncCardToDaily(api, card, settings);
          } catch (syncErr) {
            return applySyncIssueToCard(card, syncErr);
          }
        }));
        cards = synced;
        if (selectedTag === tag) {
          selectedTag = "";
        }
        await saveCards(plugin, cards);
        await refreshDailyReview();
        showMessage("标签已删除");
      } catch (err) {
        reportError(err);
      } finally {
        busy = false;
      }
    });
  }

  async function deleteCard(event: CustomEvent<CardNote>) {
    const card = event.detail;
    const removeLocal = async (removeBlock: boolean) => {
      busy = true;
      error = "";
      try {
        if (removeBlock && card.boundBlockId) {
          await api.deleteBlock(card.boundBlockId);
        }
        cards = cards.filter((item) => item.id !== card.id);
        await saveCards(plugin, cards);
        await refreshDailyReview();
        if (editingCard?.id === card.id) {
          editingCard = undefined;
        }
        showMessage("卡片已删除");
      } catch (err) {
        reportError(err);
      } finally {
        busy = false;
      }
    };

    if (!card.boundBlockId) {
      await removeLocal(false);
      return;
    }

    confirm(
      "删除卡片",
      "这张卡片已同步到日记。是否同时删除对应日记块？",
      () => void removeLocal(true),
      () => void removeLocal(false)
    );
  }

  async function updateSettings(event: CustomEvent<PluginSettings>) {
    settings = event.detail;
    await saveSettings(plugin, settings);
    await refreshDailyReview();
    showMessage("设置已保存");
  }

  function exportCards() {
    const blob = new Blob([JSON.stringify(createExportPayload(cards, settings), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `siyuan-card-note-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function importCards(event: CustomEvent<File>) {
    const file = event.detail;
    try {
      const text = await file.text();
      const payload = parseImportPayload(JSON.parse(text));
      confirm("导入数据", `将导入 ${payload.cards.length} 张卡片，并替换当前本地数据。导入前会自动创建备份。`, async () => {
        busy = true;
        error = "";
        try {
          await createBackup(plugin, cards, settings, "导入前自动备份");
          backupCount = (await loadBackups(plugin)).length;
          cards = payload.cards.map((card) => normalizeCardTags(card));
          settings = applyNotebookDefault(payload.settings, notebooks);
          editingCard = undefined;
          selectedTag = "";
          await saveCards(plugin, cards);
          await saveSettings(plugin, settings);
          await refreshDailyReview(cards, settings, createEmptyReviewState(), true);
          showMessage("数据已导入");
        } catch (err) {
          reportError(err);
        } finally {
          busy = false;
        }
      });
    } catch (err) {
      reportError(err);
    }
  }

  async function backupCards() {
    busy = true;
    error = "";
    try {
      await createBackup(plugin, cards, settings, "手动备份");
      backupCount = (await loadBackups(plugin)).length;
      showMessage("备份已创建");
    } catch (err) {
      reportError(err);
    } finally {
      busy = false;
    }
  }

  async function validateBindings() {
    const boundCards = cards.filter((card) => card.boundBlockId);
    if (boundCards.length === 0) {
      showMessage("没有需要校验的绑定卡片");
      return;
    }

    busy = true;
    error = "";
    try {
      const summary = await autoSyncBoundCards(cards, settings);
      applyCards(summary.cards);
      await saveCards(plugin, cards);
      if (summary.missing || summary.conflicts || summary.pulled || summary.pushed) {
        showMessage(`回读 ${summary.pulled} 张，同步 ${summary.pushed} 张，冲突 ${summary.conflicts} 张，失效 ${summary.missing} 张`);
      } else {
        showMessage("绑定状态正常");
      }
    } catch (err) {
      reportError(err);
    } finally {
      busy = false;
    }
  }

  function clearData() {
    confirm("清空数据", "这会清空插件本地保存的所有卡片，不会删除已经同步到日记的块。", async () => {
      await createBackup(plugin, cards, settings, "清空前自动备份");
      backupCount = (await loadBackups(plugin)).length;
      cards = [];
      reviewState = createEmptyReviewState();
      editingCard = undefined;
      selectedTag = "";
      await saveCards(plugin, cards);
      await saveReviewState(plugin, reviewState);
      showMessage("本地卡片已清空");
    });
  }

  function reportError(err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    error = message;
    console.warn("CardNote error", err);
    showMessage(message, 7000, "error");
  }

  async function updateDailyReview(card: CardNote, action: "reviewed" | "later" | "dismissToday") {
    reviewState = applyReviewAction(reviewState, card.id, action);
    await saveReviewState(plugin, reviewState);
    if (action === "reviewed") {
      showMessage("已标记回顾");
    } else if (action === "later") {
      showMessage("明天再浮现");
    } else {
      showMessage("今天先略过");
    }
  }

  async function appendReviewIdea(event: CustomEvent<{ card: CardNote; idea: string; markReviewed?: boolean }>) {
    const card = event.detail.card;
    const idea = event.detail.idea.trim();
    const markReviewed = event.detail.markReviewed !== false;
    if (!idea) {
      showMessage("请输入想法内容", 3000);
      return;
    }

    const content = appendReviewIdeaToContent(card.content, idea);
    const updated: CardNote = {
      ...card,
      content,
      manualTags: [],
      tags: buildCardTags(card.title || "", content),
      updatedAt: Date.now()
    };

    busy = true;
    error = "";
    try {
      let finalCard = updated;
      let syncFailed = false;
      if (updated.boundBlockId) {
        try {
          finalCard = await syncCardToDaily(api, updated, settings);
        } catch (syncErr) {
          syncFailed = true;
          finalCard = applySyncIssueToCard(updated, syncErr);
          reportError(syncErr);
        }
      }
      cards = cards.map((item) => item.id === finalCard.id ? finalCard : item);
      if (detailCard?.id === finalCard.id) {
        detailCard = finalCard;
      }
      await saveCards(plugin, cards);
      if (markReviewed) {
        reviewState = applyReviewAction(reviewState, finalCard.id, "reviewed");
        await saveReviewState(plugin, reviewState);
      }
      if (!syncFailed) {
        showMessage("想法已追加到卡片");
      }
    } catch (err) {
      reportError(err);
    } finally {
      busy = false;
    }
  }

  async function refreshDailyReview(nextCards = cards, nextSettings = settings, sourceState = reviewState, forceSave = false) {
    const reviewDraft = ensureDailyReview(nextCards, sourceState, nextSettings);
    reviewState = reviewDraft.state;
    if (forceSave || reviewDraft.changed) {
      await saveReviewState(plugin, reviewState);
    }
  }

  async function applySyncIssue(card: CardNote, err: unknown) {
    const updated = applySyncIssueToCard(card, err);
    cards = cards.map((item) => item.id === card.id ? updated : item);
    await saveCards(plugin, cards).catch(() => undefined);
    reportError(err);
  }

  function applySyncIssueToCard(card: CardNote, err: unknown): CardNote {
    if (err instanceof DailySyncConflictError) {
      return {
        ...card,
        syncError: err.message,
        syncConflict: err.conflict,
        syncedToDaily: false
      };
    }
    const message = err instanceof Error ? err.message : String(err);
    return {
      ...card,
      syncError: message,
      syncedToDaily: false
    };
  }

  function createId(): string {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function normalizeTitle(value: string): string {
    return stripTagControlChars(value).replace(/\s+/g, " ").trim();
  }

  async function openEditor(card: CardNote) {
    busy = true;
    error = "";
    try {
      let targetCard = card;

      if (targetCard.boundBlockId) {
        const { card: syncedCard, summary } = await autoSyncBoundCard(targetCard, settings);
        targetCard = syncedCard;
        applyCards(cards.map((item) => item.id === targetCard.id ? targetCard : item));
        await saveCards(plugin, cards);
        if (summary.conflicts) {
          showMessage("检测到本地内容与思源块存在差异，将打开思源原生块，请以块内容为准。", 6000, "error");
        }
      } else {
        targetCard = await syncCardToDaily(api, targetCard, settings, { force: true });
        applyCards(cards.map((item) => item.id === targetCard.id ? targetCard : item));
        await saveCards(plugin, cards);
        showMessage("已创建绑定块，正在打开思源编辑器");
      }

      if (!targetCard.boundBlockId) {
        throw new Error("没有获取到绑定块 ID，无法打开思源编辑器。");
      }

      detailCard = undefined;
      editingCard = targetCard;
    } catch (err) {
      reportError(err);
      detailCard = undefined;
      editingCard = undefined;
    } finally {
      busy = false;
    }
  }

  async function finishNativeEdit(card: CardNote) {
    editingCard = undefined;
    await readBackCardValue(card, { silent: true });
    showMessage("编辑内容已回读");
  }

  async function openNativeTab(card: CardNote) {
    const target = card.boundBlockId ? card : cards.find((item) => item.id === card.id) || card;
    if (!target.boundBlockId) {
      showMessage("这张卡片还没有绑定块，无法打开思源页签。", 3000, "error");
      return;
    }
    editingCard = undefined;
    await openTab({
      app: plugin.app,
      doc: {
        id: target.boundBlockId,
        zoomIn: true
      }
    });
  }

  function normalizeCardTags(card: CardNote): CardNote {
    const title = stripKramdownAttrs(card.title || "").trim();
    const content = stripKramdownAttrs(card.content).trim();
    return {
      ...card,
      title,
      content,
      manualTags: [],
      tags: buildCardTags(title, content)
    };
  }

  function replaceTag(card: CardNote, from: string, to: string): CardNote {
    const title = replaceTagInMarkdown(card.title || "", from, to);
    const content = replaceTagInMarkdown(card.content, from, to);
    return {
      ...card,
      title,
      content,
      manualTags: [],
      tags: buildCardTags(title, content),
      updatedAt: Date.now()
    };
  }

  async function autoSyncBoundCards(sourceCards: CardNote[], targetSettings: PluginSettings): Promise<AutoSyncSummary> {
    const summary = emptyAutoSyncSummary(sourceCards);
    const nextCards: CardNote[] = [];
    for (const card of sourceCards) {
      try {
        const result = await autoSyncBoundCard(card, targetSettings);
        nextCards.push(result.card);
        summary.pulled += result.summary.pulled;
        summary.pushed += result.summary.pushed;
        summary.conflicts += result.summary.conflicts;
        summary.missing += result.summary.missing;
      } catch (err) {
        nextCards.push(applySyncIssueToCard(card, err));
      }
    }
    return {
      ...summary,
      cards: nextCards
    };
  }

  async function autoSyncBoundCard(card: CardNote, targetSettings: PluginSettings): Promise<{ card: CardNote; summary: AutoSyncSummary }> {
    const summary = emptyAutoSyncSummary([card]);
    if (!card.boundBlockId) {
      return { card, summary };
    }

    const exists = await api.blockExists(card.boundBlockId);
    if (!exists) {
      summary.missing = 1;
      return {
        card: {
          ...card,
          boundBlockId: undefined,
          syncedToDaily: false,
          syncError: "绑定块不存在，已解除绑定",
          syncConflict: undefined
        },
        summary
      };
    }

    const conflict = await detectDailyBlockConflict(api, card);
    const baseMarkdown = conflict.baseMarkdown;
    const localMarkdown = normalizeMarkdown(buildDailyMarkdown(card));
    const remoteMarkdown = normalizeMarkdown(conflict.remote.markdown);

    if (remoteMarkdown === localMarkdown) {
      return {
        card: {
          ...card,
          syncError: undefined,
          syncConflict: undefined,
          lastSyncedMarkdown: conflict.remote.markdown
        },
        summary
      };
    }

    if (!baseMarkdown) {
      summary.pulled = 1;
      return {
        card: cardFromRemote(card, conflict.remote),
        summary
      };
    }

    const localChanged = localMarkdown !== baseMarkdown;
    const remoteChanged = remoteMarkdown !== baseMarkdown;

    if (remoteChanged && !localChanged) {
      summary.pulled = 1;
      return {
        card: cardFromRemote(card, conflict.remote),
        summary
      };
    }

    if (!remoteChanged && localChanged) {
      summary.pushed = 1;
      return {
        card: await syncCardToDaily(api, card, targetSettings, { force: true }),
        summary
      };
    }

    summary.conflicts = 1;
    return {
      card: markCardConflict(card, conflict),
      summary
    };
  }

  function cardFromRemote(card: CardNote, remote: DailyBlockDraft): CardNote {
    return {
      ...card,
      title: normalizeTitle(remote.title),
      content: remote.content.trim(),
      manualTags: [],
      tags: buildCardTags(remote.title, remote.content),
      updatedAt: Date.now(),
      syncedToDaily: true,
      syncError: undefined,
      syncConflict: undefined,
      lastSyncedAt: Date.now(),
      lastSyncedMarkdown: remote.markdown
    };
  }

  function markCardConflict(card: CardNote, conflict: DailyBlockConflictResult): CardNote {
    return {
      ...card,
      syncError: "检测到思源块内容冲突",
      syncConflict: toSyncConflict(conflict),
      syncedToDaily: false
    };
  }

  function emptyAutoSyncSummary(cardsValue: CardNote[]): AutoSyncSummary {
    return {
      cards: cardsValue,
      pulled: 0,
      pushed: 0,
      conflicts: 0,
      missing: 0
    };
  }

  function applyCards(nextCards: CardNote[]) {
    cards = nextCards;
    if (detailCard) {
      detailCard = cards.find((card) => card.id === detailCard?.id);
    }
    if (editingCard) {
      editingCard = cards.find((card) => card.id === editingCard?.id);
    }
  }

  function removeTag(card: CardNote, tag: string): CardNote {
    const title = removeTagFromMarkdown(card.title || "", tag);
    const content = removeTagFromMarkdown(card.content, tag);
    return {
      ...card,
      title,
      content,
      manualTags: [],
      tags: buildCardTags(title, content),
      updatedAt: Date.now()
    };
  }

  void initialize();
</script>

<div class="scn">
  <Sidebar
    {keyword}
    {selectedTag}
    {tags}
    {cards}
    total={cards.length}
    filtered={filteredCards.length}
    settingsOpen={showSettings}
    {statusFilter}
    {timeFilter}
    on:search={(event) => keyword = event.detail}
    on:selectTag={(event) => selectedTag = event.detail}
    on:status={(event) => statusFilter = event.detail}
    on:time={(event) => timeFilter = event.detail}
    on:openSettings={() => showSettings = true}
    on:closeSettings={() => showSettings = false}
    on:renameTag={renameTag}
    on:deleteTag={deleteTag}
  />

  <main class="scn-main">
    {#if error}
      <div class="scn-error">{error}</div>
    {/if}

    {#if showSettings}
      <div class="scn-page-head">
        <div>
          <strong>设置</strong>
          <span>CardNote</span>
        </div>
        <button class="b3-button b3-button--outline" type="button" on:click={() => showSettings = false}>返回卡片</button>
      </div>
      <SettingsPanel
        {settings}
        {notebooks}
        {backupCount}
        on:update={updateSettings}
        on:export={exportCards}
        on:import={importCards}
        on:backup={backupCards}
        on:validateBindings={validateBindings}
        on:clear={clearData}
      />
    {:else}
      <CaptureBox
        {busy}
        {uploadImage}
        on:submit={createCard}
        on:error={(event) => reportError(event.detail)}
        on:previewImage={(event) => previewImageSrc = event.detail}
      />

      <DailyReviewStrip
        cards={todayReviewCards}
        {reviewState}
        progress={todayReviewProgress}
        {busy}
        on:reviewed={(event) => void updateDailyReview(event.detail, "reviewed")}
        on:later={(event) => void updateDailyReview(event.detail, "later")}
        on:dismissToday={(event) => void updateDailyReview(event.detail, "dismissToday")}
        on:view={(event) => detailCard = event.detail}
        on:appendIdea={appendReviewIdea}
      />

      <div class="scn-stream-head">
        <div>
          <strong>全部卡片</strong>
          <span>{filteredCards.length} / {cards.length}</span>
        </div>
        <div class="scn-actions">
          <button class="b3-button b3-button--outline" type="button" on:click={() => void refresh()} disabled={busy}>刷新</button>
        </div>
      </div>

      <CardList
        {plugin}
        cards={filteredCards}
        viewMode={settings.viewMode}
        selectedId={editingCard?.id || ""}
        {busy}
        on:edit={(event) => openEditor(event.detail)}
        on:update={updateCard}
        on:cancelEdit={() => editingCard = undefined}
        on:error={(event) => reportError(event.detail)}
        on:view={(event) => detailCard = event.detail}
        on:delete={deleteCard}
        on:sync={syncCard}
        on:readBack={readBackCard}
        on:pin={togglePin}
        on:appendIdea={(event) => void appendReviewIdea(new CustomEvent("appendIdea", { detail: { ...event.detail, markReviewed: false } }))}
        on:previewImage={(event) => previewImageSrc = event.detail}
        on:finishNativeEdit={(event) => void finishNativeEdit(event.detail)}
        on:openNativeTab={(event) => void openNativeTab(event.detail)}
      />
    {/if}
  </main>

  {#if busy}
    <div class="scn-busy">处理中...</div>
  {/if}

  {#if detailCard}
    <CardDetail
      {plugin}
      card={detailCard}
      {busy}
      on:close={() => detailCard = undefined}
      on:edit={(event) => openEditor(event.detail)}
      on:done={(event) => void finishNativeEdit(event.detail)}
      on:error={(event) => reportError(event.detail)}
      on:openTab={(event) => void openNativeTab(event.detail)}
      on:previewImage={(event) => previewImageSrc = event.detail}
    />
  {/if}

  {#if previewImageSrc}
    <ImagePreview src={previewImageSrc} on:close={() => previewImageSrc = ""} />
  {/if}
</div>
