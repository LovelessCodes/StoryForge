/**
 * Local Monaco setup for Tauri: the default `@monaco-editor/react` loader
 * fetches Monaco from a CDN, which the app's `script-src 'self'` CSP blocks.
 * The editor and its workers are bundled with Vite instead, and only pulled in
 * when a lazily-loaded editor actually mounts.
 */
let setupPromise: Promise<void> | null = null;

/** Configures the Monaco loader with the bundled editor and workers. */
export function setupMonaco(): Promise<void> {
  setupPromise ??= (async () => {
    const [{ loader }, monaco, editorWorker, jsonWorker] = await Promise.all([
      import("@monaco-editor/react"),
      import("monaco-editor"),
      import("monaco-editor/esm/vs/editor/editor.worker?worker"),
      import("monaco-editor/esm/vs/language/json/json.worker?worker"),
    ]);

    self.MonacoEnvironment = {
      getWorker(_workerId: string, label: string) {
        if (label === "json") return new jsonWorker.default();
        return new editorWorker.default();
      },
    };

    loader.config({ monaco });
  })();

  return setupPromise;
}
