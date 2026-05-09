<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import type { Notebook, PluginSettings } from "../lib/types";

  export let settings: PluginSettings;
  export let notebooks: Notebook[] = [];
  export let backupCount = 0;

  const dispatch = createEventDispatcher<{
    update: PluginSettings;
    export: void;
    import: File;
    backup: void;
    validateBindings: void;
    clear: void;
  }>();

  function update<K extends keyof PluginSettings>(key: K, value: PluginSettings[K]) {
    dispatch("update", {
      ...settings,
      [key]: value
    });
  }

  function updateSortMode(value: string) {
    if (value === "createdAsc" || value === "updatedDesc" || value === "updatedAsc" || value === "pinned") {
      update("sortMode", value);
      return;
    }
    update("sortMode", "createdDesc");
  }

  function updateReviewLimit(value: string) {
    const limit = Number(value);
    update("dailyReviewLimit", Number.isFinite(limit) ? limit : 5);
  }

  function importData(files: FileList | null) {
    const file = files?.[0];
    if (file) {
      dispatch("import", file);
    }
  }
</script>

<section class="scn-settings">
  <div class="scn-settings__card">
    <div class="scn-settings__card-head">
      <div>
        <strong>选择日记笔记本</strong>
        <span>用于将卡片同步到思源笔记的日记中</span>
      </div>
      <span class="scn-settings__badge">{settings.dailyNotebookId ? "已配置" : "未配置"}</span>
    </div>

    <div class="scn-settings__row">
      <label>
        <span>笔记本</span>
        <select
          class="b3-select"
          value={settings.dailyNotebookId}
          on:change={(event) => update("dailyNotebookId", event.currentTarget.value)}
        >
          {#if notebooks.length === 0}
            <option value="">未找到笔记本</option>
          {:else}
            {#each notebooks as notebook}
              <option value={notebook.id}>{notebook.name}</option>
            {/each}
          {/if}
        </select>
      </label>
    </div>
  </div>

  <div class="scn-settings__card">
    <label>
      <div>
        <strong>自动同步</strong>
        <span>发布卡片时自动同步到日记</span>
      </div>
      <button
        class:scn-switch--on={settings.autoSyncToDaily}
        class="scn-switch"
        type="button"
        aria-pressed={settings.autoSyncToDaily}
        on:click={() => update("autoSyncToDaily", !settings.autoSyncToDaily)}
      >
        <span></span>
      </button>
    </label>
  </div>

  <div class="scn-settings__card">
    <label>
      <span>视图模式</span>
      <select
        class="b3-select"
        value={settings.viewMode}
        on:change={(event) => update("viewMode", event.currentTarget.value === "card" ? "card" : "list")}
      >
        <option value="list">列表</option>
        <option value="card">卡片</option>
      </select>
    </label>
  </div>

  <div class="scn-settings__card">
    <label>
      <span>排序方式</span>
      <select
        class="b3-select"
        value={settings.sortMode}
        on:change={(event) => updateSortMode(event.currentTarget.value)}
      >
        <option value="createdDesc">创建时间：新到旧</option>
        <option value="createdAsc">创建时间：旧到新</option>
        <option value="updatedDesc">更新时间：新到旧</option>
        <option value="updatedAsc">更新时间：旧到新</option>
        <option value="pinned">置顶优先</option>
      </select>
    </label>
  </div>

  <div class="scn-settings__card">
    <label>
      <div>
        <strong>每日回顾</strong>
        <span>在卡片流上方自然浮现旧卡片</span>
      </div>
      <button
        class:scn-switch--on={settings.dailyReviewEnabled}
        class="scn-switch"
        type="button"
        aria-pressed={settings.dailyReviewEnabled}
        on:click={() => update("dailyReviewEnabled", !settings.dailyReviewEnabled)}
      >
        <span></span>
      </button>
    </label>
    {#if settings.dailyReviewEnabled}
      <div class="scn-settings__row">
        <label>
          <span>每日数量</span>
          <select
            class="b3-select"
            value={settings.dailyReviewLimit}
            on:change={(event) => updateReviewLimit(event.currentTarget.value)}
          >
            <option value={3}>3 张</option>
            <option value={5}>5 张</option>
            <option value={7}>7 张</option>
            <option value={10}>10 张</option>
          </select>
        </label>
      </div>
    {/if}
  </div>

  <div class="scn-settings__actions">
    <button class="b3-button b3-button--outline" type="button" on:click={() => dispatch("validateBindings")}>校验同步状态</button>
    <button class="b3-button b3-button--outline" type="button" on:click={() => dispatch("backup")}>创建备份{backupCount ? ` (${backupCount})` : ""}</button>
    <label class="b3-button b3-button--outline scn-import-button">
      导入数据
      <input type="file" accept="application/json,.json" on:change={(event) => importData(event.currentTarget.files)} />
    </label>
    <button class="b3-button b3-button--outline" type="button" on:click={() => dispatch("export")}>导出数据</button>
    <button class="b3-button b3-button--outline scn-danger" type="button" on:click={() => dispatch("clear")}>清空数据</button>
  </div>
</section>
