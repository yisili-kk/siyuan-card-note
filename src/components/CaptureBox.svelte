<script lang="ts">
  import { tick } from "svelte";
  import { createEventDispatcher } from "svelte";
  import {
    applyShortcutToBlock,
    backspaceAtBlockStart,
    changeEditorBlockIndent,
    insertBlocksAfter as insertEditorBlocksAfter,
    pasteMarkdownIntoBlock,
    setEditorBlockType,
    splitEditorBlock,
    type EditorActionResult
  } from "../lib/editorActions";
  import {
    blocksToMarkdown,
    createEditorBlock,
    markdownToBlocks,
    type EditorBlock,
    type EditorBlockType
  } from "../lib/editorModel";
  import type { CardDraft } from "../lib/types";

  export let title = "";
  export let value = "";
  export let editing = false;
  export let busy = false;
  export let uploadImage: (file: File) => Promise<string>;

  const dispatch = createEventDispatcher<{
    submit: CardDraft;
    cancel: void;
    error: unknown;
    previewImage: string;
  }>();

  let titleValue = title;
  let lastTitle = title;
  let lastValue = value;
  let expanded = Boolean(title);
  let uploading = false;
  let fileInput: HTMLInputElement;
  let titleInput: HTMLInputElement;
  let activeBlockId = "";
  let blocks: EditorBlock[] = markdownToBlocks(value);
  let history: string[] = [value];
  let historyIndex = 0;
  let composing = false;
  let blockRefs: Record<string, HTMLElement> = {};

  $: content = blocksToMarkdown(blocks);
  $: activeBlock = blocks.find((block) => block.id === activeBlockId) || blocks[0];
  $: if (title !== lastTitle) {
    titleValue = title;
    lastTitle = title;
    expanded = Boolean(title);
  }

  $: if (value !== lastValue) {
    blocks = markdownToBlocks(value);
    lastValue = value;
    resetHistory(value);
    activeBlockId = blocks[0]?.id || "";
  }

  async function handleImage(files: FileList | null) {
    const file = files?.[0];
    if (!file) {
      return;
    }
    await insertUploadedImage(file);
    if (fileInput) {
      fileInput.value = "";
    }
  }

  async function handlePaste(event: ClipboardEvent, block: EditorBlock) {
    const files = [...(event.clipboardData?.items || [])]
      .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
      .map((item) => item.getAsFile())
      .filter((file): file is File => Boolean(file));

    if (files.length > 0) {
      event.preventDefault();
      for (const file of files) {
        await insertUploadedImage(file, block.id);
      }
      return;
    }

    const text = event.clipboardData?.getData("text/plain") || "";
    if (!text.includes("\n")) {
      return;
    }
    event.preventDefault();
    pasteMarkdown(text, block);
  }

  async function insertUploadedImage(file: File, afterBlockId = activeBlockId) {
    uploading = true;
    try {
      const uploadFile = file.name ? file : new File([file], `cardnote-${Date.now()}.png`, { type: file.type || "image/png" });
      const path = await uploadImage(uploadFile);
      insertBlocksAfter(afterBlockId, [
        createEditorBlock({
          type: "image",
          src: path,
          alt: uploadFile.name || "image",
          indent: currentBlock(afterBlockId)?.indent || 0
        }),
        createEditorBlock()
      ]);
    } catch (error) {
      dispatch("error", error);
    } finally {
      uploading = false;
    }
  }

  function submit() {
    if (busy || uploading) {
      return;
    }
    const nextTitle = titleInput?.value ?? titleValue;
    const nextContent = blocksToMarkdown(blocks);
    dispatch("submit", {
      title: nextTitle,
      content: nextContent
    });
    if (!editing) {
      titleValue = "";
      blocks = [createEditorBlock()];
      lastTitle = "";
      lastValue = "";
      expanded = false;
      resetHistory("");
      void tick().then(() => focusBlock(blocks[0].id));
    }
  }

  function toggleExpanded() {
    expanded = !expanded;
    void tick().then(() => {
      if (expanded) {
        document.querySelector<HTMLInputElement>(".scn-capture__title")?.focus();
      } else {
        focusBlock(activeBlockId || blocks[0].id);
      }
    });
  }

  function updateBlockText(block: EditorBlock, target: HTMLElement) {
    block.text = target.textContent || "";
    normalizeEmptyDocument();
    if (!composing) {
      pushHistory();
    }
  }

  function updateTitle(value: string) {
    titleValue = value;
  }

  function toggleCheck(block: EditorBlock) {
    block.checked = !block.checked;
    blocks = [...blocks];
    pushHistory();
  }

  function setBlockType(block: EditorBlock, type: EditorBlockType) {
    applyAction(setEditorBlockType(blocks, block.id, type), true);
  }

  function insertInline(markdown: string) {
    const block = activeBlock || blocks[0];
    if (block.type === "image") {
      insertBlocksAfter(block.id, [createEditorBlock({ text: markdown })]);
      return;
    }
    const element = blockRefs[block.id];
    const offset = caretOffset(element);
    block.text = `${block.text.slice(0, offset)}${markdown}${block.text.slice(offset)}`;
    blocks = [...blocks];
    pushHistory();
    void tick().then(() => focusBlock(block.id, offset + markdown.length));
  }

  function focusEditorBlank(event: MouseEvent) {
    if (busy) {
      return;
    }
    const target = event.target;
    if (target instanceof HTMLElement && target.closest(".scn-editor-block__input, .scn-editor-block__image, input, button")) {
      return;
    }
    const lastTextBlock = [...blocks].reverse().find((block) => block.type !== "image");
    if (lastTextBlock) {
      activeBlockId = lastTextBlock.id;
      void tick().then(() => focusBlock(lastTextBlock.id));
      return;
    }
    const lastBlock = blocks[blocks.length - 1];
    if (lastBlock) {
      insertBlocksAfter(lastBlock.id, [createEditorBlock()], false);
    } else {
      blocks = [createEditorBlock()];
      activeBlockId = blocks[0].id;
      void tick().then(() => focusBlock(activeBlockId));
    }
  }

  function handleEditorShellKeydown(event: KeyboardEvent) {
    if (event.target !== event.currentTarget || (event.key !== "Enter" && event.key !== " ")) {
      return;
    }
    event.preventDefault();
    const lastTextBlock = [...blocks].reverse().find((block) => block.type !== "image") || blocks[0];
    if (lastTextBlock) {
      activeBlockId = lastTextBlock.id;
      void tick().then(() => focusBlock(lastTextBlock.id));
    }
  }


  function handleKeydown(event: KeyboardEvent, block: EditorBlock) {
    const mod = event.metaKey || event.ctrlKey;
    activeBlockId = block.id;

    if (event.key === "Tab") {
      event.preventDefault();
      changeIndent(block, event.shiftKey ? -1 : 1);
      return;
    }
    if (mod && event.key === "Enter") {
      event.preventDefault();
      submit();
      return;
    }
    if (mod && event.key.toLowerCase() === "a") {
      event.preventDefault();
      selectEditorContents();
      return;
    }
    if (mod && event.key.toLowerCase() === "b") {
      event.preventDefault();
      wrapSelection("**");
      return;
    }
    if (mod && event.shiftKey && event.key.toLowerCase() === "z") {
      event.preventDefault();
      redo();
      return;
    }
    if (mod && event.key.toLowerCase() === "z") {
      event.preventDefault();
      undo();
      return;
    }
    if (mod && event.key.toLowerCase() === "y") {
      event.preventDefault();
      redo();
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      splitBlock(block);
      return;
    }
    if (event.key === "Backspace" && caretOffset(blockRefs[block.id]) === 0) {
      handleBackspaceAtStart(event, block);
      return;
    }
    if (!mod && event.key === " " && !composing && applyShortcut(block)) {
      event.preventDefault();
    }
  }

  function applyShortcut(block: EditorBlock): boolean {
    const offset = caretOffset(blockRefs[block.id]);
    const result = applyShortcutToBlock(blocks, block.id, offset);
    if (!result.handled) {
      return false;
    }
    clearBlockElement(block.id);
    applyAction(result, true);
    return true;
  }

  function clearBlockElement(blockId: string) {
    const element = blockRefs[blockId];
    if (element) {
      element.textContent = "";
    }
  }

  function splitBlock(block: EditorBlock) {
    const offset = caretOffset(blockRefs[block.id]);
    applyAction(splitEditorBlock(blocks, block.id, offset), true);
  }

  function handleBackspaceAtStart(event: KeyboardEvent, block: EditorBlock) {
    const result = backspaceAtBlockStart(blocks, block.id);
    if (result.handled) {
      event.preventDefault();
      applyAction(result, true);
    }
  }

  function changeIndent(block: EditorBlock, delta: number) {
    const result = changeEditorBlockIndent(blocks, block.id, delta);
    if (result.handled) {
      applyAction(result, true);
    }
  }

  function pasteMarkdown(text: string, block: EditorBlock) {
    const offset = caretOffset(blockRefs[block.id]);
    applyAction(pasteMarkdownIntoBlock(blocks, block.id, offset, text), true);
  }

  function insertBlocksAfter(blockId: string, nextBlocks: EditorBlock[], push = true) {
    applyAction(insertEditorBlocksAfter(blocks, blockId, nextBlocks), push);
  }

  function applyAction(result: EditorActionResult, push = true) {
    blocks = result.blocks;
    activeBlockId = result.focusId;
    if (push) {
      pushHistory();
    }
    void tick().then(() => focusBlock(result.focusId, result.focusOffset));
  }

  function wrapSelection(wrapper: string) {
    const block = activeBlock || blocks[0];
    const element = blockRefs[block.id];
    const selection = window.getSelection();
    if (!element || !selection?.rangeCount || !element.contains(selection.anchorNode)) {
      insertInline(`${wrapper}${wrapper}`);
      return;
    }
    const range = selection.getRangeAt(0);
    const selected = range.toString();
    const start = caretOffset(element, range.startContainer, range.startOffset);
    const end = caretOffset(element, range.endContainer, range.endOffset);
    block.text = `${block.text.slice(0, start)}${wrapper}${selected}${wrapper}${block.text.slice(end)}`;
    blocks = [...blocks];
    pushHistory();
    void tick().then(() => focusBlock(block.id, end + wrapper.length * 2));
  }

  function selectEditorContents() {
    const first = blockRefs[blocks[0]?.id];
    const last = blockRefs[blocks[blocks.length - 1]?.id];
    if (!first || !last) {
      return;
    }
    const range = document.createRange();
    range.setStart(first, 0);
    range.setEnd(last, last.childNodes.length);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  }

  function undo() {
    if (historyIndex <= 0) {
      return;
    }
    historyIndex -= 1;
    restoreHistory();
  }

  function redo() {
    if (historyIndex >= history.length - 1) {
      return;
    }
    historyIndex += 1;
    restoreHistory();
  }

  function pushHistory() {
    const next = blocksToMarkdown(blocks);
    if (history[historyIndex] === next) {
      return;
    }
    history = [...history.slice(0, historyIndex + 1), next].slice(-80);
    historyIndex = history.length - 1;
  }

  function resetHistory(markdown: string) {
    history = [markdown];
    historyIndex = 0;
  }

  function restoreHistory() {
    blocks = markdownToBlocks(history[historyIndex] || "");
    activeBlockId = blocks[0]?.id || "";
    void tick().then(() => focusBlock(activeBlockId));
  }

  function normalizeEmptyDocument() {
    if (blocks.length === 0) {
      blocks = [createEditorBlock()];
      return;
    }
    if (blocks.length === 1 && blocks[0].type === "paragraph" && !blocks[0].text.trim()) {
      blocks[0].indent = 0;
    }
  }

  function blockIndex(id: string) {
    return blocks.findIndex((block) => block.id === id);
  }

  function currentBlock(id: string) {
    return blocks.find((block) => block.id === id);
  }

  function focusBlock(id: string, offset?: number) {
    const element = blockRefs[id];
    if (!element) {
      return;
    }
    element.focus();
    const range = document.createRange();
    const textNode = element.firstChild;
    const position = Math.min(offset ?? element.textContent?.length ?? 0, element.textContent?.length ?? 0);
    if (textNode && textNode.nodeType === Node.TEXT_NODE) {
      range.setStart(textNode, position);
    } else {
      range.setStart(element, 0);
    }
    range.collapse(true);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  }

  function caretOffset(element?: HTMLElement, node?: Node, offset?: number) {
    if (!element) {
      return 0;
    }
    const selection = window.getSelection();
    const targetNode = node || selection?.anchorNode;
    const targetOffset = offset ?? selection?.anchorOffset ?? 0;
    if (!targetNode || !element.contains(targetNode)) {
      return element.textContent?.length || 0;
    }
    const range = document.createRange();
    range.selectNodeContents(element);
    range.setEnd(targetNode, targetOffset);
    return range.toString().length;
  }

  function markerFor(block: EditorBlock, index: number) {
    if (block.type === "bullet") {
      return "•";
    }
    if (block.type === "ordered") {
      return `${orderedNumber(index)}.`;
    }
    if (block.type === "quote") {
      return ">";
    }
    return "";
  }

  function orderedNumber(index: number) {
    const block = blocks[index];
    let count = 1;
    for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
      const previous = blocks[cursor];
      if (previous.indent < block.indent) {
        break;
      }
      if (previous.indent === block.indent) {
        if (previous.type !== "ordered") {
          break;
        }
        count += 1;
      }
    }
    return count;
  }

  function blockStyle(block: EditorBlock) {
    return `--scn-block-indent: ${block.indent}`;
  }
</script>

<section class:scn-capture--expanded={expanded} class="scn-capture">
  <button class="scn-capture__expand" type="button" title={expanded ? "收起标题" : "展开标题"} on:click={toggleExpanded}>
    {expanded ? "⤡" : "⤢"}
  </button>

  {#if expanded}
    <input
      bind:this={titleInput}
      class="scn-capture__title"
      type="text"
      value={titleValue}
      placeholder="请输入标题"
      disabled={busy}
      on:input={(event) => updateTitle(event.currentTarget.value)}
    />
  {/if}

  <div
    class:scn-capture__editor--empty={!content.trim()}
    class="scn-capture__editor scn-block-editor"
    data-placeholder="✍ 记录你的想法..."
    role="textbox"
    aria-multiline="true"
    tabindex="0"
    on:click={focusEditorBlank}
    on:keydown={handleEditorShellKeydown}
  >
    {#each blocks as block, index (block.id)}
      <div
        class:scn-editor-block--active={activeBlockId === block.id}
        class:scn-editor-block--empty={!block.text && !block.src}
        class:scn-editor-block--image={block.type === "image"}
        class="scn-editor-block scn-editor-block--{block.type}"
        style={blockStyle(block)}
      >
        <div class="scn-editor-block__marker" aria-hidden="true">
          {#if block.type === "todo"}
            <input type="checkbox" checked={Boolean(block.checked)} tabindex="-1" on:change={() => toggleCheck(block)} />
          {:else}
            {markerFor(block, index)}
          {/if}
        </div>
        {#if block.type === "image" && block.src}
          <button class="scn-editor-block__image" type="button" on:click={() => dispatch("previewImage", block.src || "")}>
            <img src={block.src} alt={block.alt || "image"} />
          </button>
        {:else}
          <div
            bind:this={blockRefs[block.id]}
            class="scn-editor-block__input"
            contenteditable={!busy}
            data-placeholder={index === 0 ? "✍ 记录你的想法..." : ""}
            role="textbox"
            tabindex="0"
            on:focus={() => activeBlockId = block.id}
            on:input={(event) => updateBlockText(block, event.currentTarget)}
            on:keydown={(event) => handleKeydown(event, block)}
            on:paste={(event) => void handlePaste(event, block)}
            on:compositionstart={() => composing = true}
            on:compositionend={(event) => {
              composing = false;
              updateBlockText(block, event.currentTarget);
              pushHistory();
            }}
          >{block.text}</div>
        {/if}
      </div>
    {/each}
  </div>

  <div class="scn-capture__toolbar">
    <button class="scn-tool-button" type="button" title="标签" on:click={() => insertInline("#标签# ")}>#</button>
    <button class="scn-tool-button" type="button" title="加粗 Ctrl/⌘+B" on:click={() => wrapSelection("**")}>B</button>
    <button class:scn-tool-button--active={activeBlock?.type === "bullet"} class="scn-tool-button" type="button" title="无序列表" on:click={() => setBlockType(activeBlock, "bullet")}>☷</button>
    <button class:scn-tool-button--active={activeBlock?.type === "ordered"} class="scn-tool-button" type="button" title="有序列表" on:click={() => setBlockType(activeBlock, "ordered")}>☰</button>
    <button class:scn-tool-button--active={activeBlock?.type === "todo"} class="scn-tool-button" type="button" title="待办" on:click={() => setBlockType(activeBlock, "todo")}>☑</button>
    <label class="b3-button b3-button--outline scn-file-button" title="上传图片">
      图
      <input
        bind:this={fileInput}
        type="file"
        accept="image/*"
        disabled={busy || uploading}
        on:change={(event) => void handleImage(event.currentTarget.files)}
      />
    </label>
    {#if editing}
      <button class="b3-button b3-button--outline" type="button" on:click={() => dispatch("cancel")} disabled={busy}>取消</button>
    {/if}
    <button class="scn-send-button" type="button" title="保存卡片" on:click={submit} disabled={busy || uploading}>
      {editing ? "保存" : uploading ? "上传中" : "保存"}
    </button>
  </div>
</section>
