#!/usr/bin/env bun
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

import { chromium, type Page } from "playwright";
import sharp from "sharp";
import { preview } from "vite";

import { createFixtures } from "./fixtures";
import { installTauriMock, type MockPlatform } from "./tauri-mock";

/**
 * Platform chrome preview.
 *
 * Renders the app with `platform()` stubbed as each OS it ships for and writes
 * one comparison sheet: three rows (macOS / Windows / Linux), each showing the
 * top of the window in light (left half) and dark (right half).
 *
 * macOS traffic lights are native and are therefore simulated in the sheet;
 * the Windows controls are drawn by the app and appear for real; Linux keeps
 * native decorations, which sit above the webview and are not rendered.
 */

const PLATFORMS = ["macos", "windows", "linux"] as const;

const NAMES: Record<MockPlatform, string> = {
  macos: "macOS",
  windows: "Windows",
  linux: "Linux",
};

const NOTES: Record<MockPlatform, string> = {
  macos: "native traffic lights — simulated",
  windows: "frameless — controls drawn by the app",
  linux: "native decorations — OS title bar above",
};

const WIDTH = 1200; // window width at 1×
const SCALE = 2; // deviceScaleFactor of the captures
const STRIP_H = 96; // visible height of the window crop at 1×
const LABEL_H = 26; // per-row label bar
const GAP = 10; // space between rows
const THEMES = ["light", "dark"] as const;

interface Options {
  out: string;
  route: string;
  keep: boolean;
  port: number;
  baseUrl: string | null;
}

function abort(message: string): never {
  console.error(`\n${message}`);
  process.exit(1);
}

function parseArgs(args: string[]): Options {
  const options: Options = {
    out: "screenshots/platforms",
    route: "profiles",
    keep: false,
    port: 4173,
    baseUrl: null,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--out") options.out = args[++i] ?? abort("--out needs a path");
    else if (arg === "--route")
      options.route = (args[++i] ?? abort("--route needs a route")).replace(/^#?\/?/, "");
    else if (arg === "--keep") options.keep = true;
    else if (arg === "--port") options.port = Number(args[++i]);
    else if (arg === "--base-url") options.baseUrl = args[++i] ?? abort("--base-url needs a URL");
    else abort(`Unknown argument: ${arg}`);
  }

  if (!Number.isInteger(options.port) || options.port <= 0) abort("--port must be a number");

  return options;
}

const options = parseArgs(process.argv.slice(2));

async function settle(page: Page): Promise<void> {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForLoadState("networkidle").catch(() => {});
  // Park the pointer away from the titlebar so no button shows a hover state.
  await page.mouse.move(400, 200);
  await page.waitForTimeout(250);
}

function svg(width: number, height: number, body: string): Buffer {
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${body}</svg>`,
  );
}

/** macOS traffic lights drawn where the native ones float over the strip. */
function trafficLights(): Buffer {
  return svg(
    WIDTH,
    STRIP_H,
    `<circle cx="26" cy="16" r="6" fill="#ff5f57"/>` +
      `<circle cx="46" cy="16" r="6" fill="#febc2e"/>` +
      `<circle cx="66" cy="16" r="6" fill="#28c840"/>`,
  );
}

function rowLabel(platform: MockPlatform): Buffer {
  const escape = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  return svg(
    WIDTH,
    LABEL_H,
    `<text x="12" y="18" font-family="Helvetica, Arial, sans-serif" font-size="12" font-weight="600" fill="#f0f0f0">${NAMES[platform]}</text>` +
      `<text x="${WIDTH - 12}" y="18" text-anchor="end" font-family="Helvetica, Arial, sans-serif" font-size="11" fill="#9a9a9a">${escape(NOTES[platform])}</text>`,
  );
}

if (!existsSync("dist/index.html")) {
  abort("No dist/ build found. Run `bun run build` first.");
}

mkdirSync(options.out, { recursive: true });

const version = (JSON.parse(readFileSync("package.json", "utf8")) as { version: string }).version;
const fixtures = createFixtures({ version });

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
    for (const platform of PLATFORMS) {
      for (const theme of THEMES) {
        const context = await browser.newContext({
          viewport: { width: WIDTH, height: 800 },
          deviceScaleFactor: SCALE,
          colorScheme: theme,
          reducedMotion: "reduce",
        });
        await context.addInitScript(
          ({
            fixtures,
            theme,
          }: {
            fixtures: Record<string, unknown>;
            theme: (typeof THEMES)[number];
          }) => {
            (window as unknown as Record<string, unknown>).__SCREENSHOT_FIXTURES__ = fixtures;
            localStorage.setItem("theme", theme);
          },
          { fixtures, theme },
        );
        await context.addInitScript(installTauriMock, platform);

        const page = await context.newPage();
        try {
          await page.goto(`${baseUrl}#/${options.route}`, { waitUntil: "domcontentloaded" });
          await page.getByText("STORY FORGE", { exact: true }).first().waitFor();
          await settle(page);
          const target = join(options.out, `${platform}.${theme}.png`);
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

  // Compose one sheet: per platform, light on the left half, dark on the right.
  const crop = { left: 0, top: 0, width: WIDTH * SCALE, height: STRIP_H * SCALE };
  const halfW = WIDTH / 2;
  const rows: Buffer[] = [];

  for (const platform of PLATFORMS) {
    const overlay = platform === "macos" ? [{ input: trafficLights(), top: 0, left: 0 }] : [];

    const [lightFull, darkFull] = await Promise.all(
      THEMES.map((theme) =>
        sharp(join(options.out, `${platform}.${theme}.png`))
          .extract(crop)
          .resize({ width: WIDTH })
          .png()
          .toBuffer(),
      ),
    );
    const withChrome = (buffer: Buffer) =>
      overlay.length > 0 ? sharp(buffer).composite(overlay).png().toBuffer() : buffer;
    const [light, dark] = await Promise.all([withChrome(lightFull), withChrome(darkFull)]);

    const [lightHalf, darkHalf] = await Promise.all([
      sharp(light).extract({ left: 0, top: 0, width: halfW, height: STRIP_H }).png().toBuffer(),
      sharp(dark).extract({ left: halfW, top: 0, width: halfW, height: STRIP_H }).png().toBuffer(),
    ]);

    rows.push(
      await sharp({
        create: { width: WIDTH, height: STRIP_H + LABEL_H, channels: 4, background: "#0b0b0b" },
      })
        .composite([
          { input: rowLabel(platform), top: 0, left: 0 },
          { input: lightHalf, top: LABEL_H, left: 0 },
          { input: darkHalf, top: LABEL_H, left: halfW },
        ])
        .png()
        .toBuffer(),
    );
  }

  const rowHeight = STRIP_H + LABEL_H;
  const sheetHeight = rows.length * rowHeight + (rows.length - 1) * GAP;
  const composites = rows.map((input, index) => ({
    input,
    top: index * (rowHeight + GAP),
    left: 0,
  }));

  const sheet = join(options.out, "platforms.webp");
  await sharp({ create: { width: WIDTH, height: sheetHeight, channels: 4, background: "#0b0b0b" } })
    .composite(composites)
    .webp({ quality: 88 })
    .toFile(sheet);

  if (!options.keep) {
    for (const platform of PLATFORMS) {
      for (const theme of THEMES) rmSync(join(options.out, `${platform}.${theme}.png`));
    }
  }

  console.log(`\n${sheet}`);
  console.log("Pass --keep to keep the full window captures.");
} finally {
  await server?.close();
}
