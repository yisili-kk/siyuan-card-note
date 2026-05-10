<script lang="ts">
  import { createEventDispatcher, tick } from "svelte";
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
    appendIdea: { card: CardNote; idea: string; markReviewed?: boolean };
  }>();

  let collapsed = false;
  let activeIdeaCardId = "";
  let ideaDrafts: Record<string, string> = {};
  let reviewTrack: HTMLDivElement;
  let canScrollLeft = false;
  let canScrollRight = false;

  $: completed = progress.total > 0 && progress.completed >= progress.total;
  $: visible = progress.total > 0 || cards.length > 0;
  $: if (reviewTrack && !collapsed && !completed && cards.length > 0) {
    cards;
    void tick().then(updateReviewScrollState);
  }

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
    dispatch("appendIdea", { card, idea, markReviewed: true });
    activeIdeaCardId = "";
    ideaDrafts = {
      ...ideaDrafts,
      [card.id]: ""
    };
  }

  function updateReviewScrollState() {
    if (!reviewTrack) {
      canScrollLeft = false;
      canScrollRight = false;
      return;
    }
    const maxScroll = reviewTrack.scrollWidth - reviewTrack.clientWidth;
    canScrollLeft = reviewTrack.scrollLeft > 2;
    canScrollRight = reviewTrack.scrollLeft < maxScroll - 2;
  }

  function scrollReview(direction: -1 | 1) {
    if (!reviewTrack) {
      return;
    }
    const distance = Math.max(280, Math.min(720, reviewTrack.clientWidth - 96));
    reviewTrack.scrollBy({ left: direction * distance, behavior: "smooth" });
    window.setTimeout(updateReviewScrollState, 240);
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
      <div class="scn-daily-review__track-wrap">
        {#if canScrollLeft}
          <button class="scn-daily-review__nav scn-daily-review__nav--left" type="button" title="向左浏览" on:click={() => scrollReview(-1)}>‹</button>
        {/if}
        <div bind:this={reviewTrack} class="scn-daily-review__track" aria-label="今日回顾卡片" on:scroll={updateReviewScrollState}>
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
        {#if canScrollRight}
          <button class="scn-daily-review__nav scn-daily-review__nav--right" type="button" title="向右浏览" on:click={() => scrollReview(1)}>›</button>
        {/if}
      </div>
    {/if}
  </section>
{/if}
