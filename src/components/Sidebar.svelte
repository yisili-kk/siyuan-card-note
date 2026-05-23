<script lang="ts">
  import { createEventDispatcher, tick } from "svelte";
  import { getCardTags, normalizeTag } from "../lib/tagService";
  import type { CardNote, CardStatusFilter, CardTimeFilter } from "../lib/types";

  export let keyword = "";
  export let selectedTag = "";
  export let tags: string[] = [];
  export let cards: CardNote[] = [];
  export let total = 0;
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
    randomCard: void;
  }>();

  let openTagMenu = "";
  let editingTag = "";
  let editingDraft = "";
  let editingInput: HTMLInputElement | null = null;
  let collapsedTags = new Set<string>();
  const heatmapWeeks = 12;
  const daysPerWeek = 7;

  interface TagTreeNode {
    name: string;
    fullPath: string;
    count: number;
    depth: number;
    children: TagTreeNode[];
    cardIds: Set<string>;
  }

  const searchItems: Array<{ value: CardStatusFilter; label: string; icon: string }> = [
    { value: "untagged", label: "无标签", icon: "◇" },
    { value: "hasImage", label: "有图片", icon: "▧" },
    { value: "hasLink", label: "有链接", icon: "∞" }
  ];

  $: heatmapCells = buildHeatmapCells(cards);
  $: heatmapMonths = buildHeatmapMonths();
  $: activeDays = countCardDays(cards);
  $: tagRows = flattenTagTree(buildTagTree(tags, cards), collapsedTags);

  function heatmapStart() {
    const today = startOfDay(Date.now());
    return startOfWeek(today) - (heatmapWeeks - 1) * daysPerWeek * 24 * 60 * 60 * 1000;
  }

  function buildHeatmapCells(cardList: CardNote[]) {
    const counts = new Map<string, number>();
    for (const card of cardList) {
      const key = dateKey(card.createdAt);
      counts.set(key, (counts.get(key) || 0) + 1);
    }

    const today = startOfDay(Date.now());
    const firstWeekStart = heatmapStart();
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

  function buildHeatmapMonths() {
    const firstWeekStart = heatmapStart();
    const labels = [];
    for (let week = 0; week < heatmapWeeks; week += 1) {
      const weekStart = firstWeekStart + week * daysPerWeek * 24 * 60 * 60 * 1000;
      let monthTime = week === 0 ? weekStart : 0;
      for (let weekday = 0; weekday < daysPerWeek; weekday += 1) {
        const time = weekStart + weekday * 24 * 60 * 60 * 1000;
        if (new Date(time).getDate() === 1) {
          monthTime = time;
          break;
        }
      }
      labels.push({
        week,
        label: monthTime ? formatMonth(monthTime) : ""
      });
    }
    return labels;
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

  function formatMonth(time: number) {
    const date = new Date(time);
    return `${date.getMonth() + 1} 月`;
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

  function clearTagAndSettings() {
    openTagMenu = "";
    editingTag = "";
    dispatch("selectTag", "");
    dispatch("closeSettings");
  }

  function showAllCards() {
    clearTagAndSettings();
    dispatch("status", "all");
    dispatch("time", "all");
  }

  function showWeekCards() {
    clearTagAndSettings();
    dispatch("status", "all");
    dispatch("time", "7d");
  }

  function selectSearchStatus(status: CardStatusFilter) {
    clearTagAndSettings();
    dispatch("status", status);
  }

  function selectTag(tag: string) {
    openTagMenu = "";
    editingTag = "";
    dispatch("status", "all");
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

  function buildTagTree(tagList: string[], cardList: CardNote[]): TagTreeNode[] {
    const roots: TagTreeNode[] = [];
    const nodeMap = new Map<string, TagTreeNode>();

    for (const tag of tagList.map((value) => normalizeTag(value)).filter(Boolean)) {
      const parts = tag.split("/").map((part) => part.trim()).filter(Boolean);
      let path = "";
      let siblings = roots;
      parts.forEach((part, depth) => {
        path = path ? `${path}/${part}` : part;
        let node = nodeMap.get(path);
        if (!node) {
          node = { name: part, fullPath: path, count: 0, depth, children: [], cardIds: new Set() };
          nodeMap.set(path, node);
          siblings.push(node);
        }
        siblings = node.children;
      });
    }

    for (const card of cardList) {
      for (const tag of getCardTags(card)) {
        const parts = normalizeTag(tag).split("/").map((part) => part.trim()).filter(Boolean);
        let path = "";
        for (const part of parts) {
          path = path ? `${path}/${part}` : part;
          nodeMap.get(path)?.cardIds.add(card.id);
        }
      }
    }

    for (const node of nodeMap.values()) {
      node.count = node.cardIds.size;
    }

    sortTagNodes(roots);
    return roots;
  }

  function sortTagNodes(nodes: TagTreeNode[]) {
    nodes.sort((a, b) => a.name.localeCompare(b.name));
    nodes.forEach((node) => sortTagNodes(node.children));
  }

  function flattenTagTree(nodes: TagTreeNode[], collapsed: Set<string>): TagTreeNode[] {
    return nodes.flatMap((node) => {
      if (collapsed.has(node.fullPath)) {
        return [node];
      }
      return [node, ...flattenTagTree(node.children, collapsed)];
    });
  }

  function tagRowStyle(node: TagTreeNode) {
    return `--scn-tag-depth: ${node.depth}`;
  }

  function toggleTagCollapse(tag: string) {
    const next = new Set(collapsedTags);
    if (next.has(tag)) {
      next.delete(tag);
    } else {
      next.add(tag);
    }
    collapsedTags = next;
  }
</script>

<aside class="scn-sidebar">
  <div class="scn-search-wrap">
    <input
      class="b3-text-field scn-search"
      type="search"
      placeholder="搜索卡片..."
      value={keyword}
      on:input={(event) => dispatch("search", event.currentTarget.value)}
    />
  </div>

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

  <div class="scn-heatmap-wrap">
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
    <div class="scn-heatmap-months" aria-hidden="true">
      {#each heatmapMonths as month}
        <span data-week={month.week}>{month.label}</span>
      {/each}
    </div>
  </div>

  <div class="scn-nav">
    <button
      class:scn-active={!selectedTag && !settingsOpen && statusFilter === "all" && timeFilter === "all"}
      class="scn-nav__item"
      type="button"
      on:click={showAllCards}
    >
      <span>▦</span>
      全部笔记
    </button>
    <button
      class:scn-active={!selectedTag && !settingsOpen && statusFilter === "all" && timeFilter === "7d"}
      class="scn-nav__item"
      type="button"
      on:click={showWeekCards}
    >
      <span>◉</span>
      本周记录
    </button>
    <button class="scn-nav__item" type="button" on:click={() => dispatch("randomCard")}>
      <span>⌘</span>
      随机漫步
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

  <div class="scn-sidebar__section">检索式</div>
  <div class="scn-nav scn-nav--compact">
    {#each searchItems as item}
      <button
        class:scn-active={!settingsOpen && !selectedTag && statusFilter === item.value}
        class="scn-nav__item"
        type="button"
        on:click={() => selectSearchStatus(item.value)}
      >
        <span>{item.icon}</span>
        {item.label}
      </button>
    {/each}
  </div>

  <div class="scn-sidebar__section">全部标签</div>
  <div class="scn-tag-list" aria-label="标签列表">
    {#if tags.length === 0}
      <div class="scn-sidebar__empty">暂无标签</div>
    {:else}
      {#each tagRows as tagNode (tagNode.fullPath)}
        {@const tag = tagNode.fullPath}
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
          <div class:scn-tag-row--child={tagNode.depth > 0} class="scn-tag-row" style={tagRowStyle(tagNode)}>
            {#if tagNode.children.length > 0}
              <button
                class:scn-tag-collapse--collapsed={collapsedTags.has(tag)}
                class="scn-tag-collapse"
                type="button"
                aria-label={collapsedTags.has(tag) ? `展开标签 ${tag}` : `收起标签 ${tag}`}
                aria-expanded={!collapsedTags.has(tag)}
                on:click|stopPropagation={() => toggleTagCollapse(tag)}
              >
                ▾
              </button>
            {:else}
              <span class="scn-tag-collapse-placeholder" aria-hidden="true"></span>
            {/if}
            <button
              class:scn-active={selectedTag === tag && !settingsOpen}
              class="scn-tag-button"
              type="button"
              title={tag}
              on:click={() => selectTag(tag)}
            >
              <span>#</span>
              <span class="scn-tag-name">{tagNode.name}</span>
              <span class="scn-tag-count">{tagNode.count}</span>
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
