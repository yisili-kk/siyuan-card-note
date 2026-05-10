<script lang="ts">
  import { createEventDispatcher, onDestroy, onMount, tick } from "svelte";
  import { Protyle, showMessage } from "siyuan";
  import type { Plugin, Protyle as ProtyleInstance } from "siyuan";
  import { firstLine } from "../lib/markdown";
  import type { CardNote } from "../lib/types";

  export let plugin: Plugin;
  export let card: CardNote;
  export let busy = false;

  const dispatch = createEventDispatcher<{
    done: CardNote;
    cancel: void;
    error: unknown;
    openTab: CardNote;
  }>();

  let host: HTMLDivElement;
  let editor: ProtyleInstance | undefined;
  let focusObserver: MutationObserver | undefined;
  let resizeObserver: ResizeObserver | undefined;
  let resizeFrame = 0;
  let editorHeight = 320;
  let initializing = true;

  $: title = card.title?.trim() || firstLine(card.content);
  $: editorStyle = `--scn-protyle-editor-height: ${editorHeight}px`;

  onMount(() => {
    void mountProtyle();
  });

  onDestroy(() => {
    destroyProtyle();
  });

  async function mountProtyle() {
    await tick();
    if (!host || !card.boundBlockId) {
      initializing = false;
      return;
    }

    try {
      editor = new Protyle(plugin.app, host, {
        blockId: card.boundBlockId,
        action: ["cb-get-focus", "cb-get-focusfirst"],
        mode: "wysiwyg",
        render: {
          title: false,
          gutter: true,
          scroll: true,
          breadcrumb: false,
          breadcrumbDocName: false
        },
        click: {
          preventInsetEmptyBlock: true
        },
        after(protyle) {
          initializing = false;
          isolateFocusedBlock();
          protyle.focus();
          protyle.resize();
        }
      });
    } catch (error) {
      initializing = false;
      dispatch("error", error);
      dispatch("openTab", card);
    }
  }

  function destroyProtyle() {
    focusObserver?.disconnect();
    focusObserver = undefined;
    resizeObserver?.disconnect();
    resizeObserver = undefined;
    if (resizeFrame) {
      cancelAnimationFrame(resizeFrame);
      resizeFrame = 0;
    }
    try {
      editor?.destroy();
    } catch (error) {
      console.warn("Destroy Protyle failed", error);
    } finally {
      editor = undefined;
    }
  }

  function isolateFocusedBlock() {
    if (!host || !card.boundBlockId) {
      return;
    }

    const apply = () => {
      const escapedId = escapeSelector(card.boundBlockId || "");
      const target = host.querySelector<HTMLElement>(`[data-node-id="${escapedId}"]`);
      const nodes = host.querySelectorAll<HTMLElement>(".protyle-wysiwyg [data-node-id]");
      if (!target || nodes.length === 0) {
        return;
      }

      nodes.forEach((node) => {
        const visible = node === target || target.contains(node) || node.contains(target);
        node.classList.toggle("scn-protyle-context-hidden", !visible);
      });
      target.classList.add("scn-protyle-focus-root");
      observeEditorHeight(target);
      scheduleEditorResize();
    };

    apply();
    focusObserver?.disconnect();
    const wysiwyg = host.querySelector(".protyle-wysiwyg");
    if (wysiwyg) {
      focusObserver = new MutationObserver(() => apply());
      focusObserver.observe(wysiwyg, {
        childList: true,
        subtree: true
      });
    }
  }

  function observeEditorHeight(target: HTMLElement) {
    if (resizeObserver) {
      return;
    }

    const wysiwyg = host.querySelector<HTMLElement>(".protyle-wysiwyg");
    resizeObserver = new ResizeObserver(() => scheduleEditorResize());
    resizeObserver.observe(target);
    if (wysiwyg) {
      resizeObserver.observe(wysiwyg);
    }
  }

  function scheduleEditorResize() {
    if (resizeFrame) {
      cancelAnimationFrame(resizeFrame);
    }

    resizeFrame = requestAnimationFrame(() => {
      resizeFrame = 0;
      syncEditorHeight();
    });
  }

  function syncEditorHeight() {
    if (!host || !card.boundBlockId) {
      return;
    }

    const escapedId = escapeSelector(card.boundBlockId || "");
    const target = host.querySelector<HTMLElement>(`[data-node-id="${escapedId}"]`);
    const toolbarReserve = 96;
    const targetHeight = target?.getBoundingClientRect().height || 0;
    const viewportLimit = Math.max(260, window.innerHeight - 240);
    const nextHeight = Math.round(Math.min(Math.max(targetHeight + toolbarReserve, 240), Math.min(620, viewportLimit)));

    if (Math.abs(nextHeight - editorHeight) < 8) {
      return;
    }

    editorHeight = nextHeight;
    void tick().then(() => editor?.resize());
  }

  function escapeSelector(value: string): string {
    return typeof CSS !== "undefined" && CSS.escape ? CSS.escape(value) : value.replace(/"/g, '\\"');
  }

  function finish() {
    if (editor?.isUploading()) {
      showMessage("图片仍在上传，请稍后再完成编辑。", 3000);
      return;
    }
    dispatch("done", card);
  }
</script>

<section class="scn-protyle-card-editor" aria-label={`编辑 ${title}`} style={editorStyle}>
  <header class="scn-protyle-card-editor__head">
    <div>
      <strong>{title}</strong>
      <span>{card.boundBlockId ? "原生编辑 · 当前块" : "正在准备绑定块"}</span>
    </div>
    <div class="scn-actions">
      <button
        class="b3-button b3-button--outline scn-protyle-card-editor__open-tab"
        type="button"
        title="在页签打开"
        aria-label="在页签打开"
        on:click={() => dispatch("openTab", card)}
        disabled={busy}
      >
        ↗
      </button>
      <button class="b3-button" type="button" on:click={finish} disabled={busy || initializing || !card.boundBlockId}>
        完成
      </button>
      <button class="b3-button b3-button--outline" type="button" on:click={() => dispatch("cancel")} disabled={busy}>
        取消
      </button>
    </div>
  </header>

  <div class="scn-protyle-card-editor__body">
    {#if initializing}
      <div class="scn-protyle-card-editor__loading">正在加载思源编辑器...</div>
    {/if}
    <div bind:this={host} class="scn-protyle-card-editor__host"></div>
  </div>
</section>
