<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import CardItem from "./CardItem.svelte";
  import ProtyleCardEditor from "./ProtyleCardEditor.svelte";
  import type { Plugin } from "siyuan";
  import type { CardDraft, CardNote, PluginSettings } from "../lib/types";

  const INITIAL_CARD_COUNT = 30;
  const CARD_BATCH_SIZE = 30;

  export let plugin: Plugin;
  export let cards: CardNote[] = [];
  export let viewMode: PluginSettings["viewMode"] = "list";
  export let selectedId = "";
  export let busy = false;

  let listElement: HTMLElement;
  let visibleCount = INITIAL_CARD_COUNT;
  let previousCardIds = "";

  const dispatch = createEventDispatcher<{
    view: CardNote;
    edit: CardNote;
    update: { card: CardNote; draft: CardDraft };
    cancelEdit: void;
    error: unknown;
    delete: CardNote;
    sync: CardNote;
    readBack: CardNote;
    pin: CardNote;
    appendIdea: { card: CardNote; idea: string };
    previewImage: string;
    finishNativeEdit: CardNote;
    openNativeTab: CardNote;
  }>();

  $: cardIds = cards.map((card) => card.id).join("|");
  $: if (cardIds !== previousCardIds) {
    previousCardIds = cardIds;
    visibleCount = Math.min(cards.length, INITIAL_CARD_COUNT);
  }
  $: selectedIndex = selectedId ? cards.findIndex((card) => card.id === selectedId) : -1;
  $: if (selectedIndex >= visibleCount) {
    visibleCount = Math.min(cards.length, selectedIndex + 1);
  }
  $: visibleCards = cards.slice(0, visibleCount);
  $: hasMoreCards = visibleCount < cards.length;

  function loadMoreCards() {
    if (!hasMoreCards) {
      return;
    }
    visibleCount = Math.min(cards.length, visibleCount + CARD_BATCH_SIZE);
  }

  function loadMoreOnIntersect(node: HTMLElement) {
    if (typeof IntersectionObserver === "undefined") {
      loadMoreCards();
      return {};
    }

    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        loadMoreCards();
      }
    }, {
      root: listElement,
      rootMargin: "360px 0px",
      threshold: 0.01
    });

    observer.observe(node);
    return {
      destroy() {
        observer.disconnect();
      }
    };
  }
</script>

<section bind:this={listElement} class:scn-card-list--grid={viewMode === "card"} class="scn-card-list">
  {#if cards.length === 0}
    <div class="scn-empty">暂无卡片</div>
  {:else}
    {#each visibleCards as card (card.id)}
      {#if selectedId === card.id}
        <div class="scn-card-editor">
          <ProtyleCardEditor
            {plugin}
            {card}
            {busy}
            on:error={(event) => dispatch("error", event.detail)}
            on:done={(event) => dispatch("finishNativeEdit", event.detail)}
            on:cancel={() => dispatch("cancelEdit")}
            on:openTab={(event) => dispatch("openNativeTab", event.detail)}
          />
        </div>
      {:else}
        <CardItem
          {card}
          selected={false}
          {busy}
          on:view={(event) => dispatch("view", event.detail)}
          on:edit={(event) => dispatch("edit", event.detail)}
          on:delete={(event) => dispatch("delete", event.detail)}
          on:sync={(event) => dispatch("sync", event.detail)}
          on:readBack={(event) => dispatch("readBack", event.detail)}
          on:pin={(event) => dispatch("pin", event.detail)}
          on:appendIdea={(event) => dispatch("appendIdea", event.detail)}
          on:previewImage={(event) => dispatch("previewImage", event.detail)}
        />
      {/if}
    {/each}
    {#if hasMoreCards}
      <div class="scn-card-list__loader" use:loadMoreOnIntersect>
        <span>继续加载</span>
      </div>
    {/if}
  {/if}
</section>
