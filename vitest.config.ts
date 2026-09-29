import { defineConfig } from "vitest/config";

// Standalone config: the app's vite.config.ts loads the Tauri/router plugins,
// which are unnecessary for unit tests and interfere with them.
export default defineConfig({
  resolve: {
    alias: {
      "@": new URL("./src", import.meta.url).pathname,
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
