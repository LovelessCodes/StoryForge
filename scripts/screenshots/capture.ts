#!/usr/bin/env bun
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { chromium, type Page } from "playwright";
import { preview } from "vite";

import { createFixtures } from "./fixtures";

/**
 * Headless README screenshot capture.
 *
 * Serves the built frontend (`bun run build` first), opens it in headless
 * Chromium at the app's 1200×800 window size, and captures every page in both
 * themes as `NAME.light.png` / `NAME.dark.png` pairs. `bun run screenshots`
 * then composites each pair into the committed WebP.
 *
 * The browser is not the Tauri webview, so `window.__TAURI_INTERNALS__.invoke`
 * is stubbed with the fixtures in `fixtures.ts` before any app code runs. The
 * UI itself is the real frontend: every page, component and style is the same
 * code that ships in the app.
 */

const DEFAULTS = {
  dir: "screenshots",
  port: 4173,
  themes: ["light", "dark"] as const,
};

type Theme = (typeof DEFAULTS.themes)[number];

interface Shot {
  name: string;
  /** Hash route to open, without the leading `#/`. */
  route: string;
  setup: (page: Page) => Promise<void>;
}

function abort(message: string): never {
  console.error(`\n${message}`);
  process.exit(1);
}

function parseArgs(args: string[]) {
  const options = {
    dir: DEFAULTS.dir,
    port: DEFAULTS.port,
    only: null as string[] | null,
    baseUrl: null as string | null,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--dir") options.dir = args[++i] ?? abort("--dir needs a path");
    else if (arg === "--port") options.port = Number(args[++i]);
    else if (arg === "--base-url") options.baseUrl = args[++i] ?? abort("--base-url needs a URL");
    else if (arg === "--only") {
      options.only = (args[++i] ?? abort("--only needs a comma-separated list")).split(",");
    } else abort(`Unknown argument: ${arg}`);
  }

  if (!Number.isInteger(options.port) || options.port <= 0) abort("--port must be a number");

  return options;
}

const options = parseArgs(process.argv.slice(2));

async function settle(page: Page): Promise<void> {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForLoadState("networkidle").catch(() => {});
  // Remote mod logos: wait for them so the shots don't show empty tiles.
  await page
    .evaluate(
      () =>
        new Promise<void>((resolve) => {
          const pending = Array.from(document.images)
            .filter((image) => !image.complete)
            .map(
              (image) => new Promise<void>((done) => (image.onload = image.onerror = () => done())),
            );
          void Promise.all(pending).then(() => resolve());
          setTimeout(resolve, 5_000);
        }),
    )
    .catch(() => {});
  // Park the pointer on empty titlebar space: a leftover hover would open a
  // sidebar tooltip or light up a card.
  await page.mouse.move(760, 16);
  await page.waitForTimeout(300);
}

const shots: Shot[] = [
  {
    name: "profiles",
    route: "profiles",
    setup: async (page) => {
      await page.getByText("Bangers & Mash", { exact: true }).first().waitFor();
      await page.getByText("Redwood Valley", { exact: true }).first().waitFor();
    },
  },
  {
    name: "mods",
    route: "mods",
    setup: async (page) => {
      await page.getByText(/^\d[\d,]* mods$/).waitFor();
      await page.getByText("Carry On", { exact: true }).first().waitFor();
      await page.getByText("A Culinary Artillery", { exact: true }).first().waitFor();
    },
  },
  {
    name: "adding-mod",
    route: "mods",
    setup: async (page) => {
      await page.getByText("XSkills", { exact: true }).first().waitFor();
      const card = page.locator("div.bg-card", { hasText: "XSkills" }).first();
      await card.getByRole("button", { name: "Add mod" }).click();
      await page.getByRole("heading", { name: /Add XSkills/ }).waitFor();
      await page.waitForTimeout(400);
    },
  },
  {
    name: "versions",
    route: "versions",
    setup: async (page) => {
      await page.getByText("1.21.5", { exact: true }).first().waitFor();
      await page.getByText(/^Installed versions/).waitFor();
    },
  },
  {
    name: "worlds",
    route: "worlds",
    setup: async (page) => {
      await page.getByText("Seraph's Landing", { exact: true }).first().waitFor();
      await page.getByText("Redwood Valley", { exact: true }).first().waitFor();
    },
  },
  {
    name: "servers",
    route: "servers",
    setup: async (page) => {
      await page.getByText("Anego Studios Official", { exact: true }).first().waitFor();
      await page.getByText("Survival Friends", { exact: true }).first().waitFor();
    },
  },
  {
    name: "public-servers",
    route: "servers?tab=public",
    setup: async (page) => {
      await page.getByText(/^\d[\d,]* servers$/).waitFor();
      await page.getByText("Vintage Story Official", { exact: true }).first().waitFor();
    },
  },
  {
    name: "hosting",
    route: "servers?tab=hosting",
    setup: async (page) => {
      await page.getByText("Friends Server", { exact: true }).first().waitFor();
      await page.getByText("Public Test Server", { exact: true }).first().waitFor();
    },
  },
  {
    name: "mod-configs",
    route: "config",
    setup: async (page) => {
      await page.getByText("carryon.json", { exact: true }).first().waitFor();
      await page.waitForTimeout(400);
    },
  },
  {
    name: "news",
    route: "news",
    setup: async (page) => {
      await page.getByText("v1.21.5 released", { exact: true }).first().waitFor();
      await page.getByText(/Dear Extraordinary Survivalists/).waitFor();
    },
  },
  {
    name: "settings",
    route: "settings",
    setup: async (page) => {
      await page.getByText("Data folders", { exact: true }).first().waitFor();
      await page.getByText("Appearance", { exact: true }).first().waitFor();
    },
  },
];

/**
 * Runs inside the page before any app code. Installs a fake Tauri IPC bridge
 * backed by `window.__SCREENSHOT_FIXTURES__` so `invoke()` resolves locally.
 */
function installTauriMock(): void {
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

  // `platform()` is read at module scope (shortcut labels, path helpers), so
  // the OS plugin internals must exist before the frontend runs. Linux keeps
  // local and CI captures identical.
  (w as unknown as Record<string, unknown>).__TAURI_OS_PLUGIN_INTERNALS__ = {
    platform: "linux",
    version: "1.0.0",
    arch: "x86_64",
    family: "unix",
    osType: "linux",
    locale: "en-US",
  };

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

if (!existsSync("dist/index.html")) {
  abort("No dist/ build found. Run `bun run build` first.");
}

mkdirSync(options.dir, { recursive: true });

const version = (JSON.parse(readFileSync("package.json", "utf8")) as { version: string }).version;
const fixtures = createFixtures({ version });

const selected = options.only ? shots.filter((shot) => options.only?.includes(shot.name)) : shots;
if (options.only && selected.length !== options.only.length) {
  abort(`Unknown shot in --only. Available: ${shots.map((shot) => shot.name).join(", ")}`);
}

let server: Awaited<ReturnType<typeof preview>> | null = null;
let baseUrl = options.baseUrl;

try {
  if (!baseUrl) {
    server = await preview({
      preview: { host: "127.0.0.1", port: options.port, strictPort: true },
    });
    baseUrl = `http://127.0.0.1:${options.port}`;
  }

  const browser = await chromium.launch().catch((error: unknown) => {
    abort(
      `Could not launch Chromium: ${String(error)}\n` +
        "Install the browser first: bunx playwright install chromium",
    );
  });

  try {
    for (const shot of selected) {
      for (const theme of DEFAULTS.themes) {
        const context = await browser.newContext({
          viewport: { width: 1200, height: 800 },
          deviceScaleFactor: 2,
          colorScheme: theme,
          reducedMotion: "reduce",
        });
        await context.addInitScript(
          ({ fixtures, theme }: { fixtures: Record<string, unknown>; theme: Theme }) => {
            (window as unknown as Record<string, unknown>).__SCREENSHOT_FIXTURES__ = fixtures;
            localStorage.setItem("theme", theme);
          },
          { fixtures, theme },
        );
        await context.addInitScript(installTauriMock);

        const page = await context.newPage();
        await page.goto(`${baseUrl}#/${shot.route}`, { waitUntil: "domcontentloaded" });
        await page.getByText("STORY FORGE", { exact: true }).first().waitFor();

        try {
          await shot.setup(page);
          await settle(page);
          const target = join(options.dir, `${shot.name}.${theme}.png`);
          await page.screenshot({ path: target });
          console.log(`${target}  (${theme})`);
        } finally {
          await context.close();
        }
      }
    }
  } finally {
    await browser.close();
  }
} finally {
  await server?.close();
}

console.log(`\nDone. ${selected.length} shots × ${DEFAULTS.themes.length} themes.`);
console.log("Composite them with `bun run screenshots`.");
