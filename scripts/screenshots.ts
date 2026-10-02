#!/usr/bin/env bun
import { readdirSync, statSync, unlinkSync } from "node:fs";
import { extname, join } from "node:path";

import sharp from "sharp";

/**
 * Build the README screenshots from paired light/dark captures.
 *
 * Each page is captured twice, as `NAME.light.png` and `NAME.dark.png`. The
 * script stitches the pair into one image split on the bottom-left-to-top-right
 * diagonal: the top-left triangle keeps the light capture, the bottom-right the
 * dark one. It then ships the result as WebP and removes the PNGs, so only the
 * composited, embedded format is committed.
 */

const DEFAULTS = {
  dir: "screenshots",
  width: 1200,
  quality: 88,
};

const LIGHT_SUFFIX = ".light.png";
const DARK_SUFFIX = ".dark.png";

function abort(message: string): never {
  console.error(`\n${message}`);
  process.exit(1);
}

function parseArgs(args: string[]) {
  const options = { ...DEFAULTS, keep: false };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--keep") options.keep = true;
    else if (arg === "--dir") options.dir = args[++i] ?? abort("--dir needs a path");
    else if (arg === "--width") options.width = Number(args[++i]);
    else if (arg === "--quality") options.quality = Number(args[++i]);
    else abort(`Unknown argument: ${arg}`);
  }

  if (!Number.isFinite(options.width) || options.width <= 0) abort("--width must be a number");
  if (!Number.isFinite(options.quality) || options.quality <= 0 || options.quality > 100)
    abort("--quality must be between 1 and 100");

  return options;
}

const options = parseArgs(process.argv.slice(2));

let files: string[];
try {
  files = readdirSync(options.dir);
} catch {
  abort(`No such directory: ${options.dir}`);
}

/** Base names (without the `.light` / `.dark` suffix) that have any capture. */
const bases = new Set<string>();
for (const file of files) {
  const lower = file.toLowerCase();
  if (lower.endsWith(LIGHT_SUFFIX) || lower.endsWith(DARK_SUFFIX)) {
    const suffix = lower.endsWith(DARK_SUFFIX) ? DARK_SUFFIX : LIGHT_SUFFIX;
    bases.add(file.slice(0, -suffix.length));
  } else if (extname(lower) === ".png") {
    console.warn(`Skipping ${file}: captures must be named NAME.light.png / NAME.dark.png.`);
  }
}

if (bases.size === 0) {
  abort(
    `No .light.png / .dark.png pairs found in ${options.dir}. Capture both themes first (screenshots/README.md).`,
  );
}

const missing: string[] = [];
for (const base of bases) {
  if (!files.includes(`${base}${LIGHT_SUFFIX}`)) missing.push(`${base}${LIGHT_SUFFIX}`);
  if (!files.includes(`${base}${DARK_SUFFIX}`)) missing.push(`${base}${DARK_SUFFIX}`);
}
if (missing.length > 0) {
  abort(`Missing captures:\n  ${missing.join("\n  ")}`);
}

const kb = (bytes: number) => `${(bytes / 1024).toFixed(0)} KB`;

/** Upper-left triangle (above the bottom-left-to-top-right diagonal), white. */
function maskFor(width: number, height: number) {
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
      `<polygon points="0,0 ${width},0 0,${height}" fill="#fff"/></svg>`,
  );
}

let saved = 0;

for (const base of bases) {
  const lightPath = join(options.dir, `${base}${LIGHT_SUFFIX}`);
  const darkPath = join(options.dir, `${base}${DARK_SUFFIX}`);
  const target = join(options.dir, `${base}.webp`);

  const [lightMeta, darkMeta] = await Promise.all([
    sharp(lightPath).metadata(),
    sharp(darkPath).metadata(),
  ]);
  const width = lightMeta.width ?? 0;
  const height = lightMeta.height ?? 0;

  if (width === 0 || height === 0 || darkMeta.width !== width || darkMeta.height !== height) {
    console.error(
      `Failed: ${base}\n  ${lightMeta.width}×${lightMeta.height} and ${darkMeta.width}×${darkMeta.height} must match.`,
    );
    process.exitCode = 1;
    continue;
  }

  // Downscale first: sharp resizes before compositing, and the diagonal mask
  // must be cut at the output size (captures are 2× on Retina).
  const [lightScaled, darkScaled] = await Promise.all([
    sharp(lightPath).resize({ width: options.width }).png().toBuffer(),
    sharp(darkPath).resize({ width: options.width }).png().toBuffer(),
  ]);
  const scaledMeta = await sharp(darkScaled).metadata();
  const outWidth = scaledMeta.width ?? 0;
  const outHeight = scaledMeta.height ?? 0;

  // Keep the light capture only inside the upper-left triangle, then lay it over
  // the full dark capture: light top-left, dark bottom-right.
  const lightTriangle = await sharp(lightScaled)
    .ensureAlpha()
    .composite([{ input: maskFor(outWidth, outHeight), blend: "dest-in" }])
    .png()
    .toBuffer();

  await sharp(darkScaled)
    .composite([{ input: lightTriangle }])
    .webp({ quality: options.quality })
    .toFile(target);

  const before = statSync(lightPath).size + statSync(darkPath).size;
  const after = statSync(target).size;
  saved += before - after;
  console.log(`${base}.{light,dark}.png -> ${target}  ${kb(before)} -> ${kb(after)}`);

  if (!options.keep) {
    unlinkSync(lightPath);
    unlinkSync(darkPath);
  }
}

console.log(`\nDone. Saved ${kb(saved)} total.`);
