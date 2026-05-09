import { svelte } from "@sveltejs/vite-plugin-svelte";
import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { defineConfig } from "vite";

const root = process.cwd();
const dist = resolve(root, "dist");

function copyIfExists(from: string, to: string) {
  if (!existsSync(from)) {
    return;
  }
  mkdirSync(resolve(to, ".."), { recursive: true });
  copyFileSync(from, to);
}

function copyStaticPlugin() {
  return {
    name: "copy-static-plugin-files",
    closeBundle() {
      mkdirSync(dist, { recursive: true });
      copyIfExists(resolve(root, "plugin.json"), resolve(dist, "plugin.json"));
      copyIfExists(resolve(root, "README.md"), resolve(dist, "README.md"));
      copyIfExists(resolve(root, "README_zh_CN.md"), resolve(dist, "README_zh_CN.md"));
      copyIfExists(resolve(root, "icon.svg"), resolve(dist, "icon.svg"));
      copyIfExists(resolve(root, "icon.png"), resolve(dist, "icon.png"));
      copyIfExists(resolve(root, "preview.png"), resolve(dist, "preview.png"));

      const i18nSource = resolve(root, "public/i18n");
      const i18nTarget = resolve(dist, "i18n");
      if (existsSync(i18nSource)) {
        rmSync(i18nTarget, { recursive: true, force: true });
        cpSync(i18nSource, i18nTarget, { recursive: true });
      }
    }
  };
}

export default defineConfig({
  plugins: [
    svelte(),
    copyStaticPlugin()
  ],
  build: {
    target: "es2020",
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: false,
    lib: {
      entry: resolve(root, "src/index.ts"),
      formats: ["cjs"],
      fileName: () => "index.js"
    },
    rollupOptions: {
      external: ["siyuan"],
      output: {
        assetFileNames: (assetInfo) => {
          if (assetInfo.name === "style.css") {
            return "index.css";
          }
          return "[name][extname]";
        },
        exports: "default"
      }
    }
  },
  resolve: {
    alias: {
      $lib: join(root, "src/lib")
    }
  }
});
