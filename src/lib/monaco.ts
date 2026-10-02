import { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import jsonWorker from "monaco-editor/esm/vs/language/json/json.worker?worker";

/**
 * Local Monaco setup for Tauri: the default `@monaco-editor/react` loader
 * fetches Monaco from a CDN, which the app's `script-src 'self'` CSP blocks.
 * Importing this module bundles Monaco and its workers with Vite instead.
 */
self.MonacoEnvironment = {
  getWorker(_workerId: string, label: string) {
    if (label === "json") return new jsonWorker();
    return new editorWorker();
  },
};

loader.config({ monaco });
