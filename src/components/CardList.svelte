<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import CardItem from "./CardItem.svelte";
  import ProtyleCardEditor from "./ProtyleCardEditor.svelte";
  import type { Plugin } from "siyuan";
  import type { CardDraft, CardNote, PluginSettings } from "../lib/types";

  export let plugin: Plugin;
  export let cards: CardNote[] = [];
  export let viewMode: PluginSettings["viewMode"] = "list";
  export let selectedId = "";
  export let busy = false;

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
</script>

<section class:scn-card-list--grid={viewMode === "card"} class="scn-card-list">
  {#if cards.length === 0}
    <div class="scn-empty">暂无卡片</div>
  {:else}
    {#each cards as card (card.id)}
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
  {/if}
</section>
