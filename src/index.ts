import App from "./App.svelte";
import { openTab, Plugin, showMessage } from "siyuan";
import type { Custom } from "siyuan";
import { TAB_TYPE } from "./lib/constants";
import type { AppApi } from "./lib/types";
import "./app.css";

export default class SiYuanCardNote extends Plugin {
  private readonly apps = new Set<AppApi>();
  private customApps = new WeakMap<Custom, AppApi>();

  onload(): void {
    this.addIcons(`
      <symbol id="iconCardNote" viewBox="0 0 32 32">
        <rect x="5" y="7" width="22" height="16" rx="3"></rect>
        <path d="M10 13h12M10 17h7" stroke="currentColor" stroke-width="2" stroke-linecap="round"></path>
        <path d="M12 26h8" stroke="currentColor" stroke-width="3" stroke-linecap="round"></path>
      </symbol>
    `);

    const plugin = this;
    this.addTab({
      type: TAB_TYPE,
      init(this: Custom) {
        const app = new App({
          target: this.element as HTMLElement,
          props: {
            plugin
          }
        }) as unknown as AppApi & { $destroy(): void };
        plugin.apps.add(app);
        plugin.customApps.set(this, app);
      },
      destroy(this: Custom) {
        const app = plugin.customApps.get(this) as (AppApi & { $destroy?: () => void }) | undefined;
        try {
          app?.$destroy?.();
        } finally {
          if (app) {
            plugin.apps.delete(app);
          }
          plugin.customApps.delete(this);
        }
      }
    });

    this.addCommand({
      langKey: "openCardNote",
      langText: this.i18n.openCardNote || "Open CardNote",
      hotkey: "⌥⇧⌘C",
      callback: () => {
        void this.openCardNote();
      }
    });

    this.addCommand({
      langKey: "refreshCards",
      langText: this.i18n.refreshCards || "Refresh cards",
      callback: () => {
        void this.refreshApps();
      }
    });
  }

  onLayoutReady(): void {
    this.addTopBar({
      icon: "iconCardNote",
      title: this.displayName || "CardNote",
      position: "right",
      callback: () => {
        void this.openCardNote();
      }
    });
  }

  onunload(): void {
    this.apps.clear();
    this.customApps = new WeakMap();
  }

  private async openCardNote(): Promise<void> {
    await openTab({
      app: this.app,
      custom: {
        id: `${this.name}${TAB_TYPE}`,
        icon: "iconCardNote",
        title: this.displayName || "CardNote",
        data: {}
      }
    });
  }

  private async refreshApps(): Promise<void> {
    if (this.apps.size === 0) {
      await this.openCardNote();
      return;
    }
    await Promise.all([...this.apps].map((app) => app.refresh()));
    showMessage("卡片列表已刷新");
  }
}
