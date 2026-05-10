<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import type { Plugin } from "siyuan";
  import { firstLine, renderMarkdownPreview } from "../lib/markdown";
  import type { CardNote } from "../lib/types";
  import ProtyleCardEditor from "./ProtyleCardEditor.svelte";

  export let plugin: Plugin;
  export let card: CardNote;
  export let busy = false;

  const dispatch = createEventDispatcher<{
    close: void;
    edit: CardNote;
    done: CardNote;
    openTab: CardNote;
    error: unknown;
    previewImage: string;
  }>();

  let editing = false;
  let renderedCardId = "";

  $: title = card.title?.trim() || firstLine(card.content);
  $: html = renderMarkdownPreview(card.content);
  $: created = new Date(card.createdAt).toLocaleString();
  $: updated = new Date(card.updatedAt).toLocaleString();
  $: if (card.id !== renderedCardId) {
    renderedCardId = card.id;
    editing = false;
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

  function startEdit() {
    if (!card.boundBlockId) {
      dispatch("edit", card);
      return;
    }
    editing = true;
  }

  function finishEdit() {
    editing = false;
    dispatch("done", card);
  }
</script>

<div class="scn-detail-backdrop" role="presentation">
  <button class="scn-detail-backdrop__close" type="button" aria-label="关闭详情" on:click={() => dispatch("close")}></button>
  <article class:scn-detail--editing={editing} class="scn-detail" role="dialog" aria-modal="true" aria-label={title}>
    {#if editing}
      <ProtyleCardEditor
        {plugin}
        {card}
        {busy}
        on:done={finishEdit}
        on:cancel={() => editing = false}
        on:error={(event) => dispatch("error", event.detail)}
        on:openTab={(event) => dispatch("openTab", event.detail)}
      />
    {:else}
      <header class="scn-detail__head">
        <div>
          <strong>{title}</strong>
          <span>创建 {created} · 更新 {updated}</span>
        </div>
        <button type="button" title="关闭" on:click={() => dispatch("close")}>×</button>
      </header>

      <div class="scn-detail__content" role="presentation" on:click={previewImage} on:keydown={handleContentKeydown}>
        {@html html}
      </div>

      <footer class="scn-detail__foot">
        {#if card.syncConflict}
          <span class="scn-card__sync-error" title="思源日记块已被修改，可手动处理">内容冲突</span>
        {/if}
        <div class="scn-actions">
          <button class="b3-button" type="button" on:click={startEdit}>编辑</button>
        </div>
      </footer>
    {/if}
  </article>
</div>
