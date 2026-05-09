<script lang="ts">
  import { createEventDispatcher } from "svelte";

  export let src = "";

  const dispatch = createEventDispatcher<{ close: void }>();

  function closeByKeyboard(event: KeyboardEvent) {
    if (event.key === "Escape" || event.key === "Enter" || event.key === " ") {
      dispatch("close");
    }
  }
</script>

<svelte:window on:keydown={closeByKeyboard} />

<div class="scn-image-preview" role="presentation" on:click={() => dispatch("close")} on:keydown={closeByKeyboard}>
  <button class="scn-image-preview__close" type="button" aria-label="关闭图片预览" on:click={() => dispatch("close")}>×</button>
  <button class="scn-image-preview__canvas" type="button" aria-label="查看图片" on:click|stopPropagation>
    <img src={src} alt="图片预览" />
  </button>
</div>
