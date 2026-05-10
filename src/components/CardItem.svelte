<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import { firstLine, renderMarkdownPreview } from "../lib/markdown";
  import type { CardNote } from "../lib/types";

  export let card: CardNote;
  export let selected = false;
  export let busy = false;

  const dispatch = createEventDispatcher<{
    view: CardNote;
    edit: CardNote;
    delete: CardNote;
    sync: CardNote;
    readBack: CardNote;
    pin: CardNote;
    appendIdea: { card: CardNote; idea: string };
    previewImage: string;
  }>();

  let expanded = false;
  let ideaOpen = false;
  let ideaDraft = "";
  let renderedCardId = "";

  $: html = renderMarkdownPreview(card.content);
  $: title = card.title?.trim() || firstLine(card.content);
  $: created = new Date(card.createdAt).toLocaleString();
  $: shouldCollapse = isLongContent(card.content);
  $: if (card.id !== renderedCardId) {
    renderedCardId = card.id;
    expanded = false;
    ideaOpen = false;
    ideaDraft = "";
  }

  function isLongContent(content: string): boolean {
    const lineCount = content.trim().split(/\r?\n/).filter(Boolean).length;
    return content.length > 120 || lineCount > 2 || /^[-*]\s+/m.test(content) || /!\[[^\]]*]\([^)]+\)/.test(content);
  }

  function previewImage(event: MouseEvent) {
    const target = event.target;
    if (target instanceof HTMLImageElement) {
      dispatch("previewImage", target.currentSrc || target.src);
    }
  }

  function handleContentKeydown(event: KeyboardEvent) {
    if (event.key === "Enter" || event.key === " ") {
      previewImage(event as unknown as MouseEvent);
    }
  }

  function saveIdea() {
    const idea = ideaDraft.trim();
    if (!idea) {
      return;
    }
    dispatch("appendIdea", { card, idea });
    ideaDraft = "";
    ideaOpen = false;
  }
</script>

<article class:scn-card--selected={selected} class="scn-card" on:dblclick={() => dispatch("edit", card)}>
  <header class="scn-card__head">
    <div>
      <div class="scn-card__title" title={title}>{title}</div>
      <div class="scn-card__time">{created}</div>
    </div>
    <div class="scn-card__actions" role="group" aria-label="卡片操作" on:dblclick|stopPropagation>
      <button type="button" title="阅读" on:click={() => dispatch("view", card)}>□</button>
      <button type="button" title="置顶" on:click={() => dispatch("pin", card)}>{card.pinned ? "★" : "☆"}</button>
      <button type="button" title="编辑" on:click={() => dispatch("edit", card)}>✎</button>
      <button class="scn-danger" type="button" title="删除" on:click={() => dispatch("delete", card)}>×</button>
    </div>
  </header>

  <div
    class:scn-card__content--collapsed={shouldCollapse && !expanded}
    class="scn-card__content"
    role="presentation"
    on:click={previewImage}
    on:dblclick|stopPropagation={() => dispatch("edit", card)}
    on:keydown={handleContentKeydown}
  >
    {@html html}
  </div>

  {#if ideaOpen}
    <div class="scn-card__idea" role="presentation" on:dblclick|stopPropagation>
      <textarea
        value={ideaDraft}
        placeholder="给这张卡补一句新的想法..."
        rows="3"
        disabled={busy}
        on:input={(event) => ideaDraft = event.currentTarget.value}
      ></textarea>
      <div>
        <button type="button" disabled={busy || !ideaDraft.trim()} on:click={saveIdea}>保存想法</button>
        <button type="button" disabled={busy} on:click={() => {
          ideaOpen = false;
          ideaDraft = "";
        }}>取消</button>
      </div>
    </div>
  {/if}

  <footer class="scn-card__foot">
    <div class="scn-card__foot-left">
      {#if shouldCollapse}
        <button class="scn-card__expand" type="button" on:click={() => expanded = !expanded}>
          {expanded ? "收起" : "展开"}
        </button>
      {/if}
      <button class="scn-card__idea-toggle" type="button" disabled={busy} on:click={() => ideaOpen = !ideaOpen}>记想法</button>
    </div>
    <div class="scn-card__meta">
      {#if card.syncConflict}
        <span class="scn-card__sync-error" title="思源日记块已被修改，可从日记回读或手动处理">内容冲突</span>
      {:else if card.syncError}
        <span class="scn-card__sync-error" title={card.syncError}>同步异常</span>
      {/if}
      {#if card.boundBlockId}
        <span title={card.boundBlockId}>已绑定</span>
      {:else}
        <span>未同步</span>
      {/if}
    </div>
  </footer>
</article>
