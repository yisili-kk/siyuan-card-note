<script lang="ts">
  import { createEventDispatcher, tick } from "svelte";
  import type { CardNote, CardStatusFilter, CardTimeFilter } from "../lib/types";

  export let keyword = "";
  export let selectedTag = "";
  export let tags: string[] = [];
  export let cards: CardNote[] = [];
  export let total = 0;
  export let filtered = 0;
  export let settingsOpen = false;
  export let statusFilter: CardStatusFilter = "all";
  export let timeFilter: CardTimeFilter = "all";

  const dispatch = createEventDispatcher<{
    search: string;
    selectTag: string;
    status: CardStatusFilter;
    time: CardTimeFilter;
    openSettings: void;
    closeSettings: void;
    renameTag: { from: string; to: string };
    deleteTag: string;
  }>();

  let openTagMenu = "";
  let editingTag = "";
  let editingDraft = "";
  let editingInput: HTMLInputElement | null = null;
  const heatmapWeeks = 12;
  const daysPerWeek = 7;

  const statusItems: Array<{ value: CardStatusFilter; label: string }> = [
    { value: "all", label: "全部" },
    { value: "synced", label: "已同步" },
    { value: "unsynced", label: "未同步" },
    { value: "error", label: "异常" },
    { value: "pinned", label: "置顶" }
  ];

  const timeItems: Array<{ value: CardTimeFilter; label: string }> = [
    { value: "all", label: "不限" },
    { value: "today", label: "今天" },
    { value: "7d", label: "7 天" },
    { value: "30d", label: "30 天" }
  ];

  $: heatmapCells = buildHeatmapCells(cards);
  $: activeDays = countCardDays(cards);

  function buildHeatmapCells(cardList: CardNote[]) {
    const counts = new Map<string, number>();
    for (const card of cardList) {
      const key = dateKey(card.createdAt);
      counts.set(key, (counts.get(key) || 0) + 1);
    }

    const today = startOfDay(Date.now());
    const firstWeekStart = startOfWeek(today) - (heatmapWeeks - 1) * daysPerWeek * 24 * 60 * 60 * 1000;
    const cells = [];

    for (let week = 0; week < heatmapWeeks; week += 1) {
      for (let weekday = 0; weekday < daysPerWeek; weekday += 1) {
        const time = firstWeekStart + (week * daysPerWeek + weekday) * 24 * 60 * 60 * 1000;
        const key = dateKey(time);
        const count = time <= today ? counts.get(key) || 0 : 0;
        cells.push({
          key,
          count,
          level: heatmapLevel(count),
          week,
          label: `${formatDate(time)}：${time <= today ? count > 0 ? `${count} 张卡片` : "无卡片" : "未来日期"}`
        });
      }
    }

    return cells;
  }

  function countCardDays(cardList: CardNote[]) {
    return new Set(cardList.map((card) => dateKey(card.createdAt))).size;
  }

  function startOfDay(time: number) {
    const date = new Date(time);
    date.setHours(0, 0, 0, 0);
    return date.getTime();
  }

  function startOfWeek(time: number) {
    const date = new Date(time);
    const weekday = (date.getDay() + 6) % 7;
    date.setDate(date.getDate() - weekday);
    date.setHours(0, 0, 0, 0);
    return date.getTime();
  }

  function dateKey(time: number) {
    const date = new Date(time);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function formatDate(time: number) {
    const date = new Date(time);
    return `${date.getMonth() + 1} 月 ${date.getDate()} 日`;
  }

  function heatmapLevel(count: number) {
    if (count >= 8) {
      return 4;
    }
    if (count >= 5) {
      return 3;
    }
    if (count >= 2) {
      return 2;
    }
    if (count >= 1) {
      return 1;
    }
    return 0;
  }

  function selectTag(tag: string) {
    openTagMenu = "";
    editingTag = "";
    dispatch("selectTag", selectedTag === tag ? "" : tag);
    dispatch("closeSettings");
  }

  async function startRenameTag(tag: string) {
    openTagMenu = "";
    editingTag = tag;
    editingDraft = tag;
    await tick();
    editingInput?.focus();
    editingInput?.select();
  }

  function submitRenameTag() {
    const from = editingTag;
    const to = editingDraft.trim();
    editingTag = "";
    editingDraft = "";
    if (from && to) {
      dispatch("renameTag", { from, to });
    }
  }

  function cancelRenameTag() {
    editingTag = "";
    editingDraft = "";
  }

  function deleteTag(tag: string) {
    openTagMenu = "";
    editingTag = "";
    dispatch("deleteTag", tag);
  }
</script>

<aside class="scn-sidebar">
  <div class="scn-sidebar__head">
    <div>
      <strong>CardNote</strong>
      <span>{filtered} / {total}</span>
    </div>
  </div>

  <input
    class="b3-text-field scn-search"
    type="search"
    placeholder="搜索卡片..."
    value={keyword}
    on:input={(event) => dispatch("search", event.currentTarget.value)}
  />

  <div class="scn-stats" aria-label="卡片统计">
    <div>
      <strong>{total}</strong>
      <span>笔记</span>
    </div>
    <div>
      <strong>{tags.length}</strong>
      <span>标签</span>
    </div>
    <div>
      <strong>{activeDays}</strong>
      <span>天</span>
    </div>
  </div>

  <div class="scn-heatmap" aria-label="最近卡片日期分布">
    {#each heatmapCells as cell}
      <span
        class:scn-heatmap__hot={cell.count > 0}
        class="scn-heatmap__level-{cell.level}"
        data-tooltip={cell.label}
        data-week={cell.week}
        aria-label={cell.label}
        title={cell.label}
      ></span>
    {/each}
  </div>

  <div class="scn-filter-chips" aria-label="状态筛选">
    {#each statusItems as item}
      <button
        class:scn-filter-chip--active={statusFilter === item.value}
        type="button"
        on:click={() => dispatch("status", item.value)}
      >
        {item.label}
      </button>
    {/each}
  </div>

  <div class="scn-filter-chips" aria-label="时间筛选">
    {#each timeItems as item}
      <button
        class:scn-filter-chip--active={timeFilter === item.value}
        type="button"
        on:click={() => dispatch("time", item.value)}
      >
        {item.label}
      </button>
    {/each}
  </div>

  <div class="scn-nav">
    <button
      class:scn-active={!selectedTag && !settingsOpen}
      class="scn-nav__item"
      type="button"
      on:click={() => {
        dispatch("selectTag", "");
        dispatch("closeSettings");
      }}
    >
      <span>▦</span>
      全部笔记
    </button>
    <button
      class:scn-active={settingsOpen}
      class="scn-nav__item"
      type="button"
      on:click={() => dispatch("openSettings")}
    >
      <span>⚙</span>
      设置
    </button>
  </div>

  <div class="scn-sidebar__section">全部标签</div>
  <div class="scn-tag-list" aria-label="标签列表">
    {#if tags.length === 0}
      <div class="scn-sidebar__empty">暂无标签</div>
    {:else}
      {#each tags as tag}
        {#if editingTag === tag}
          <form class="scn-tag-editor" on:submit|preventDefault={submitRenameTag}>
            <span>#</span>
            <input
              bind:this={editingInput}
              bind:value={editingDraft}
              type="text"
              aria-label={`编辑标签 ${tag}`}
              on:keydown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  cancelRenameTag();
                }
              }}
            />
            <button type="submit" title="保存标签">✓</button>
            <button type="button" title="取消" on:click={cancelRenameTag}>×</button>
          </form>
        {:else}
          <div class="scn-tag-row">
            <button
              class:scn-active={selectedTag === tag && !settingsOpen}
              class="scn-tag-button"
              type="button"
              title={tag}
              on:click={() => selectTag(tag)}
            >
              <span>#</span>
              <span>{tag}</span>
            </button>
            <button
              class:scn-tag-menu-button--open={openTagMenu === tag}
              class="scn-tag-menu-button"
              type="button"
              aria-label={`管理标签 ${tag}`}
              aria-expanded={openTagMenu === tag}
              on:click|stopPropagation={() => {
                editingTag = "";
                openTagMenu = openTagMenu === tag ? "" : tag;
              }}
            >
              ⋯
            </button>
            {#if openTagMenu === tag}
              <div class="scn-tag-menu" role="menu">
                <button type="button" role="menuitem" on:click|stopPropagation={() => startRenameTag(tag)}>
                  <span>✎</span>
                  重命名/合并
                </button>
                <button class="scn-tag-menu__danger" type="button" role="menuitem" on:click|stopPropagation={() => deleteTag(tag)}>
                  <span>⌫</span>
                  删除标签
                </button>
              </div>
            {/if}
          </div>
          {/if}
      {/each}
    {/if}
  </div>
</aside>
