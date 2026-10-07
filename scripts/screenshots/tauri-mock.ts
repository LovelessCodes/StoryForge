/**
 * Fake Tauri IPC bridge for headless captures.
 *
 * Runs inside the page before any app code. `window.__SCREENSHOT_FIXTURES__`
 * must already be set (capture scripts install it with their first init
 * script) so `invoke()` resolves locally. The OS plugin internals must also
 * exist before the frontend runs: `platform()` is read at module scope
 * (shortcut labels, path helpers, window chrome).
 */

export type MockPlatform = "linux" | "macos" | "windows";

/** Shaped like the internals `@tauri-apps/plugin-os` injects. */
export function installTauriMock(platform: MockPlatform): void {
  // Defined inline: init scripts are serialized, so the body cannot reach
  // module scope.
  const osInternals: Record<MockPlatform, Record<string, string>> = {
    linux: {
      platform: "linux",
      version: "1.0.0",
      arch: "x86_64",
      family: "unix",
      osType: "linux",
      locale: "en-US",
    },
    macos: {
      platform: "macos",
      version: "15.0.0",
      arch: "aarch64",
      family: "unix",
      osType: "macos",
      locale: "en-US",
    },
    windows: {
      platform: "windows",
      version: "11",
      arch: "x86_64",
      family: "windows",
      osType: "windows",
      locale: "en-US",
    },
  };
  interface ScreenshotWindow extends Window {
    __SCREENSHOT_FIXTURES__: Record<string, unknown>;
    __TAURI_INTERNALS__: Record<string, unknown>;
    isTauri?: boolean;
  }
  const w = window as unknown as ScreenshotWindow;
  const fixtures = w.__SCREENSHOT_FIXTURES__;
  const callbacks = new Map<number, (payload: unknown) => void>();
  let nextCallbackId = 1;

  (w as unknown as Record<string, unknown>).__TAURI_EVENT_PLUGIN_INTERNALS__ = {
    unregisterListener: () => {},
  };

  (w as unknown as Record<string, unknown>).__TAURI_OS_PLUGIN_INTERNALS__ = osInternals[platform];

  w.__TAURI_INTERNALS__ = {
    // Some APIs (event listeners, webview drag-drop) read window metadata at
    // module or mount time, so it must exist before the frontend runs.
    metadata: {
      currentWindow: { label: "main" },
      currentWebview: { windowLabel: "main", label: "main" },
    },
    invoke: (cmd: string, args: Record<string, unknown> = {}) => {
      // The one command keyed by argument: resolve the requested mod.
      if (cmd === "fetch_mod_info") {
        const infos = fixtures[cmd] as Record<string, unknown>;
        return Promise.resolve(infos[String(args.modid)] ?? null);
      }
      if (Object.prototype.hasOwnProperty.call(fixtures, cmd)) {
        return Promise.resolve(structuredClone(fixtures[cmd]));
      }
      // Unmocked plugin commands (events, updater, dialogs) resolve to null.
      return Promise.resolve(null);
    },
    transformCallback: (callback: (payload: unknown) => void, once = false) => {
      const id = nextCallbackId++;
      callbacks.set(id, (payload) => {
        callback(payload);
        if (once) callbacks.delete(id);
      });
      return id;
    },
    unregisterCallback: (id: number) => {
      callbacks.delete(id);
    },
    convertFileSrc: (path: string) => path,
  };
  w.isTauri = true;
}
