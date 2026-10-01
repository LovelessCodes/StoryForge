import { fileURLToPath } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const host = process.env.TAURI_DEV_HOST;

// monaco-editor's package `exports` map rewrites deep paths to `esm/vs/*.js`,
// which breaks Vite's `?worker` imports (it would look for
// `esm/vs/esm/vs/...`). Alias the real directory so worker modules resolve.
const monacoEsmDir = fileURLToPath(new URL("./node_modules/monaco-editor/esm/vs", import.meta.url));

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [tanstackRouter({ target: "react", autoCodeSplitting: true }), react(), tailwindcss()],
  resolve: {
    alias: {
      "monaco-editor/esm/vs": monacoEsmDir,
    },
    tsconfigPaths: true,
  },
  optimizeDeps: {
    // The `?worker` entry points must stay out of dep prebundling: the
    // optimizer rewrites them into plain chunks that have no default export,
    // so the `import worker from "...?worker"` bindings fail in dev. Entries
    // are matched against the bare specifier including its query string.
    exclude: [
      "monaco-editor/esm/vs/editor/editor.worker?worker",
      "monaco-editor/esm/vs/language/json/json.worker?worker",
    ],
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
