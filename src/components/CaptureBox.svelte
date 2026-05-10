<script lang="ts">
  import { tick } from "svelte";
  import { createEventDispatcher } from "svelte";
  import {
    applyShortcutToBlock,
    backspaceAtBlockStart,
    changeEditorBlockIndent,
    deleteEditorBlock,
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
  import { normalizeTag } from "../lib/tagService";
  import type { CardDraft } from "../lib/types";

  export let title = "";
  export let value = "";
  export let editing = false;
  export let busy = false;
  export let tags: string[] = [];
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
  let imageRefs: Record<string, HTMLButtonElement> = {};
  let captureElement: HTMLElement;
  let tagSuggestion: {
    blockId: string;
    start: number;
    query: string;
    left: number;
    top: number;
    selectedIndex: number;
  } | null = null;

  $: content = blocksToMarkdown(blocks);
  $: activeBlock = blocks.find((block) => block.id === activeBlockId) || blocks[0];
  $: tagSuggestionOptions = buildTagSuggestionOptions(tagSuggestion?.query || "");
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
      fileInput.blur();
    }
  }

  function blurFileInputSoon() {
    window.setTimeout(() => fileInput?.blur(), 0);
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
    blocks = blocks;
    normalizeEmptyDocument();
    updateTagSuggestion(block);
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

  function insertTagTrigger() {
    insertInline("#");
    void tick().then(() => {
      const block = currentBlock(activeBlockId) || blocks[0];
      if (block) {
        updateTagSuggestion(block);
      }
    });
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

    if (handleTagSuggestionKeydown(event, block)) {
      return;
    }
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
    if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
      window.setTimeout(() => updateTagSuggestion(block), 0);
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
    syncBlockTextFromDom(block);
    closeTagSuggestion();
    const offset = caretOffset(blockRefs[block.id]);
    applyAction(splitEditorBlock(blocks, block.id, offset), true);
  }

  function handleBackspaceAtStart(event: KeyboardEvent, block: EditorBlock) {
    syncBlockTextFromDom(block);
    const result = backspaceAtBlockStart(blocks, block.id);
    if (result.handled) {
      event.preventDefault();
      applyAction(result, true);
    }
  }

  function syncBlockTextFromDom(block: EditorBlock) {
    const element = blockRefs[block.id];
    if (element) {
      block.text = element.textContent || "";
    }
  }

  function handleImageKeydown(event: KeyboardEvent, block: EditorBlock) {
    activeBlockId = block.id;
    if (event.key !== "Backspace" && event.key !== "Delete") {
      return;
    }
    event.preventDefault();
    deleteBlock(block);
  }

  function deleteBlock(block: EditorBlock) {
    applyAction(deleteEditorBlock(blocks, block.id), true);
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
    closeTagSuggestion();
    blocks = result.blocks;
    activeBlockId = result.focusId;
    if (push) {
      pushHistory();
    }
    void tick().then(() => {
      syncEditableDomFromModel();
      focusBlock(result.focusId, result.focusOffset);
    });
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
    closeTagSuggestion();
    blocks = markdownToBlocks(history[historyIndex] || "");
    activeBlockId = blocks[0]?.id || "";
    void tick().then(() => {
      syncEditableDomFromModel();
      focusBlock(activeBlockId);
    });
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
    const imageElement = imageRefs[id];
    if (imageElement) {
      imageElement.focus();
      return;
    }

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

  function syncEditableDomFromModel() {
    for (const block of blocks) {
      if (block.type === "image") {
        continue;
      }
      const element = blockRefs[block.id];
      if (element && element.textContent !== block.text) {
        element.textContent = block.text;
      }
    }
  }

  function buildTagSuggestionOptions(query: string) {
    const normalizedTags = [...new Set(tags.map((tag) => normalizeTag(tag)).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b));
    const normalizedQuery = normalizeTag(query);
    const lowered = normalizedQuery.toLocaleLowerCase();
    const matches = normalizedTags
      .filter((tag) => !lowered || tag.toLocaleLowerCase().includes(lowered))
      .slice(0, normalizedQuery ? 7 : 8)
      .map((tag) => ({ value: tag, label: tag, create: false }));

    if (!normalizedQuery || normalizedTags.some((tag) => tag.toLocaleLowerCase() === lowered)) {
      return matches;
    }
    return [{ value: normalizedQuery, label: `创建 ${normalizedQuery}`, create: true }, ...matches];
  }

  function updateTagSuggestion(block: EditorBlock) {
    if (composing || block.type === "image") {
      closeTagSuggestion();
      return;
    }
    const element = blockRefs[block.id];
    if (!element || document.activeElement !== element) {
      closeTagSuggestion();
      return;
    }

    const text = element.textContent || "";
    const offset = caretOffset(element);
    const trigger = findTagTrigger(text, offset);
    if (!trigger) {
      closeTagSuggestion();
      return;
    }

    const position = tagSuggestionPosition(element, offset);
    tagSuggestion = {
      blockId: block.id,
      start: trigger.start,
      query: trigger.query,
      left: position.left,
      top: position.top,
      selectedIndex: tagSuggestion?.query === trigger.query ? tagSuggestion.selectedIndex : 0
    };
  }

  function findTagTrigger(text: string, offset: number) {
    const before = text.slice(0, offset);
    const start = before.lastIndexOf("#");
    if (start < 0) {
      return null;
    }
    const previous = start > 0 ? before[start - 1] : "";
    const query = before.slice(start + 1);
    if ((previous && !/\s/.test(previous)) || /[\s#]/.test(query)) {
      return null;
    }
    return { start, query };
  }

  function tagSuggestionPosition(element: HTMLElement, offset: number) {
    const hostRect = captureElement.getBoundingClientRect();
    const range = document.createRange();
    const textNode = element.firstChild;
    const length = element.textContent?.length || 0;
    if (textNode && textNode.nodeType === Node.TEXT_NODE) {
      range.setStart(textNode, Math.min(offset, length));
    } else {
      range.setStart(element, 0);
    }
    range.collapse(true);
    const rect = range.getBoundingClientRect();
    const fallback = element.getBoundingClientRect();
    const rawLeft = (rect.width || rect.height ? rect.left : fallback.left) - hostRect.left;
    const rawTop = (rect.width || rect.height ? rect.bottom : fallback.bottom) - hostRect.top;
    const maxLeft = Math.max(12, hostRect.width - 360);
    return {
      left: Math.max(12, Math.min(rawLeft, maxLeft)),
      top: Math.max(12, rawTop + 8)
    };
  }

  function handleTagSuggestionKeydown(event: KeyboardEvent, block: EditorBlock) {
    if (!tagSuggestion || tagSuggestion.blockId !== block.id) {
      return false;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      closeTagSuggestion();
      return true;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const direction = event.key === "ArrowDown" ? 1 : -1;
      const nextIndex = wrapIndex(tagSuggestion.selectedIndex + direction, tagSuggestionOptions.length);
      tagSuggestion = { ...tagSuggestion, selectedIndex: nextIndex };
      return true;
    }
    if (event.key === "Enter" || event.key === "Tab") {
      if (tagSuggestionOptions.length === 0) {
        return false;
      }
      event.preventDefault();
      selectTagSuggestion(tagSuggestionOptions[tagSuggestion.selectedIndex] || tagSuggestionOptions[0]);
      return true;
    }
    return false;
  }

  function wrapIndex(index: number, length: number) {
    if (length <= 0) {
      return 0;
    }
    return (index + length) % length;
  }

  function selectTagSuggestion(option: { value: string }) {
    if (!tagSuggestion) {
      return;
    }
    const block = currentBlock(tagSuggestion.blockId);
    const element = block ? blockRefs[block.id] : undefined;
    if (!block || !element) {
      closeTagSuggestion();
      return;
    }

    const offset = caretOffset(element);
    const text = element.textContent || "";
    const insertText = `#${option.value}# `;
    block.text = `${text.slice(0, tagSuggestion.start)}${insertText}${text.slice(offset)}`;
    element.textContent = block.text;
    blocks = [...blocks];
    pushHistory();
    const focusOffset = tagSuggestion.start + insertText.length;
    closeTagSuggestion();
    void tick().then(() => focusBlock(block.id, focusOffset));
  }

  function closeTagSuggestion() {
    tagSuggestion = null;
  }

  function editableText(node: HTMLElement, text: string) {
    const setText = (nextText: string) => {
      if (document.activeElement !== node && node.textContent !== nextText) {
        node.textContent = nextText;
      }
    };
    setText(text);
    return {
      update(nextText: string) {
        setText(nextText);
      }
    };
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

<section bind:this={captureElement} class:scn-capture--expanded={expanded} class="scn-capture">
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
          <div
            class="scn-editor-block__image-wrap"
            aria-label="图片块"
          >
            <button
              bind:this={imageRefs[block.id]}
              class="scn-editor-block__image"
              type="button"
              on:focus={() => activeBlockId = block.id}
              on:keydown={(event) => handleImageKeydown(event, block)}
              on:click={() => dispatch("previewImage", block.src || "")}
            >
              <img src={block.src} alt={block.alt || "image"} />
            </button>
            <button class="scn-editor-block__image-delete" type="button" title="删除图片" aria-label="删除图片" on:click={() => deleteBlock(block)}>×</button>
          </div>
        {:else}
          <div
            bind:this={blockRefs[block.id]}
            class="scn-editor-block__input"
            contenteditable={!busy}
            data-placeholder={index === 0 ? "✍ 记录你的想法..." : ""}
            role="textbox"
            tabindex="0"
            use:editableText={block.text}
            on:focus={() => {
              activeBlockId = block.id;
              window.setTimeout(() => updateTagSuggestion(block), 0);
            }}
            on:input={(event) => updateBlockText(block, event.currentTarget)}
            on:keydown={(event) => handleKeydown(event, block)}
            on:click={() => updateTagSuggestion(block)}
            on:paste={(event) => void handlePaste(event, block)}
            on:compositionstart={() => composing = true}
            on:compositionend={(event) => {
              composing = false;
              updateBlockText(block, event.currentTarget);
              pushHistory();
            }}
          ></div>
        {/if}
      </div>
    {/each}
  </div>

  {#if tagSuggestion && tagSuggestionOptions.length > 0}
    <div
      class="scn-tag-suggest"
      style={`left: ${tagSuggestion.left}px; top: ${tagSuggestion.top}px;`}
      role="listbox"
      aria-label="选择或创建标签"
    >
      {#each tagSuggestionOptions as option, index (`${option.create ? "new" : "tag"}-${option.value}`)}
        <button
          class:scn-tag-suggest__item--active={index === tagSuggestion.selectedIndex}
          class="scn-tag-suggest__item"
          type="button"
          role="option"
          aria-selected={index === tagSuggestion.selectedIndex}
          on:mousedown|preventDefault={() => selectTagSuggestion(option)}
        >
          <span>{option.create ? "+" : "#"}</span>
          <strong>{option.label}</strong>
        </button>
      {/each}
    </div>
  {/if}

  <div class="scn-capture__toolbar">
    <button class="scn-tool-button" type="button" title="标签" on:click={insertTagTrigger}>#</button>
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
        on:click={blurFileInputSoon}
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
