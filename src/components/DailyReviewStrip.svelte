<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import { firstLine } from "../lib/markdown";
  import { getReviewReason } from "../lib/review";
  import type { DailyReviewProgress } from "../lib/review";
  import type { CardNote, ReviewState } from "../lib/types";

  export let cards: CardNote[] = [];
  export let reviewState: ReviewState;
  export let progress: DailyReviewProgress = { total: 0, completed: 0 };
  export let busy = false;

  const dispatch = createEventDispatcher<{
    reviewed: CardNote;
    later: CardNote;
    dismissToday: CardNote;
    view: CardNote;
    appendIdea: { card: CardNote; idea: string };
  }>();

  let collapsed = false;
  let activeIdeaCardId = "";
  let ideaDrafts: Record<string, string> = {};

  $: completed = progress.total > 0 && progress.completed >= progress.total;
  $: visible = progress.total > 0 || cards.length > 0;

  function excerpt(card: CardNote): string {
    const title = card.title?.trim();
    const content = card.content
      .replace(/!\[[^\]]*]\([^)]+\)/g, "")
      .replace(/[`*_>#-]/g, "")
      .replace(/\s+/g, " ")
      .trim();
    const source = title && content.startsWith(title) ? content.slice(title.length).trim() : content;
    return source || "打开卡片，和这个旧想法重新碰一下。";
  }

  function tags(card: CardNote): string[] {
    return (card.tags || []).slice(0, 2);
  }

  function openIdea(card: CardNote) {
    activeIdeaCardId = activeIdeaCardId === card.id ? "" : card.id;
  }

  function updateIdea(card: CardNote, value: string) {
    ideaDrafts = {
      ...ideaDrafts,
      [card.id]: value
    };
  }

  function saveIdea(card: CardNote) {
    const idea = (ideaDrafts[card.id] || "").trim();
    if (!idea) {
      return;
    }
    dispatch("appendIdea", { card, idea });
    activeIdeaCardId = "";
    ideaDrafts = {
      ...ideaDrafts,
      [card.id]: ""
    };
  }
</script>

{#if visible}
  <section class:scn-daily-review--collapsed={collapsed || completed} class="scn-daily-review" aria-label="今日回顾">
    <header class="scn-daily-review__head">
      <div>
        <strong>今日回顾</strong>
        <span>{progress.completed} / {progress.total} 已看</span>
      </div>
      <div class="scn-daily-review__head-actions">
        {#if completed}
          <span>今天遇见了 {progress.total} 张旧卡片</span>
        {:else if collapsed}
          <button class="b3-button b3-button--outline" type="button" on:click={() => collapsed = false}>展开</button>
        {:else}
          <button class="b3-button b3-button--outline" type="button" on:click={() => collapsed = true}>收起</button>
        {/if}
      </div>
    </header>

    {#if !collapsed && !completed}
      <div class="scn-daily-review__track" aria-label="今日回顾卡片">
        {#each cards as card (card.id)}
          <article class="scn-daily-review-card">
            <div class="scn-daily-review-card__meta">
              <div>
                {#each tags(card) as tag}
                  <span>#{tag}</span>
                {/each}
                {#if tags(card).length === 0}
                  <span>未标记</span>
                {/if}
              </div>
              <span>{getReviewReason(card, reviewState)}</span>
            </div>
            <button class="scn-daily-review-card__body" type="button" on:click={() => dispatch("view", card)}>
              <strong title={card.title?.trim() || firstLine(card.content)}>{card.title?.trim() || firstLine(card.content)}</strong>
              <span>{excerpt(card)}</span>
            </button>
            <footer class="scn-daily-review-card__actions">
              <button class="scn-daily-review-card__primary" type="button" disabled={busy} on:click={() => dispatch("reviewed", card)}>已看</button>
              <button type="button" disabled={busy} on:click={() => openIdea(card)}>记想法</button>
              <button type="button" disabled={busy} on:click={() => dispatch("later", card)}>稍后</button>
              <button type="button" disabled={busy} title="今天不看" on:click={() => dispatch("dismissToday", card)}>略过</button>
              <button type="button" disabled={busy} title="打开卡片" on:click={() => dispatch("view", card)}>↗</button>
            </footer>
            {#if activeIdeaCardId === card.id}
              <div class="scn-daily-review-card__idea">
                <textarea
                  value={ideaDrafts[card.id] || ""}
                  placeholder="给这张旧卡补一句今天的想法..."
                  rows="3"
                  on:input={(event) => updateIdea(card, event.currentTarget.value)}
                ></textarea>
                <div>
                  <button type="button" disabled={busy || !(ideaDrafts[card.id] || "").trim()} on:click={() => saveIdea(card)}>保存想法</button>
                  <button type="button" disabled={busy} on:click={() => activeIdeaCardId = ""}>取消</button>
                </div>
              </div>
            {/if}
          </article>
        {/each}
      </div>
    {/if}
  </section>
{/if}
