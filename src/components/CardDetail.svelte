<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import { firstLine, renderMarkdownPreview } from "../lib/markdown";
  import type { CardNote } from "../lib/types";

  export let card: CardNote;

  const dispatch = createEventDispatcher<{
    close: void;
    edit: CardNote;
    sync: CardNote;
    readBack: CardNote;
    previewImage: string;
  }>();

  $: title = card.title?.trim() || firstLine(card.content);
  $: html = renderMarkdownPreview(card.content);
  $: created = new Date(card.createdAt).toLocaleString();
  $: updated = new Date(card.updatedAt).toLocaleString();

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
</script>

<div class="scn-detail-backdrop" role="presentation">
  <button class="scn-detail-backdrop__close" type="button" aria-label="关闭详情" on:click={() => dispatch("close")}></button>
  <article class="scn-detail" role="dialog" aria-modal="true" aria-label={title}>
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
        <span class="scn-card__sync-error" title="思源日记块已被修改，可从日记回读或手动处理">内容冲突</span>
      {/if}
      <div class="scn-actions">
        {#if card.boundBlockId}
          <button class="b3-button b3-button--outline" type="button" on:click={() => dispatch("readBack", card)}>回读</button>
        {/if}
        <button class="b3-button b3-button--outline" type="button" on:click={() => dispatch("sync", card)}>同步</button>
        <button class="b3-button" type="button" on:click={() => dispatch("edit", card)}>编辑</button>
      </div>
    </footer>
  </article>
</div>
