#!/usr/bin/env bun
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Locale parity check.
 *
 * Verifies that every bundled locale mirrors the English catalog:
 * - the same key set (locales may add extra plural forms, never drop keys)
 * - the same `{{interpolation}}` variables per key
 * - the same `<Trans>` component tags per key
 * - every key statically referenced with `t("…")` from `src/` exists
 *
 * Usage: `bun scripts/check-i18n.ts [language...]` (defaults to all).
 */

const localesDir = "src/lib/i18n/locales";
const sourceLanguage = "en";

type Tree = Record<string, unknown>;

function flatten(node: Tree, prefix: string, out = new Map<string, string>()): Map<string, string> {
  for (const [key, value] of Object.entries(node)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      flatten(value as Tree, path, out);
    } else {
      out.set(path, String(value));
    }
  }
  return out;
}

function placeholders(value: string): string[] {
  return [...value.matchAll(/\{\{\s*([^},\s]+)[^}]*\}\}/g)].map((m) => m[1]).sort();
}

function tags(value: string): string[] {
  return [...value.matchAll(/<\/?([a-zA-Z][\w-]*)[^>]*>/g)].map((m) => m[1]).sort();
}

function loadLanguage(language: string): Map<string, string> {
  const dir = join(localesDir, language);
  const flat = new Map<string, string>();
  for (const file of readdirSync(dir)) {
    if (!file.endsWith(".json")) continue;
    const area = file.slice(0, -".json".length);
    const tree = JSON.parse(readFileSync(join(dir, file), "utf8")) as Tree;
    flatten(tree, area, flat);
  }
  return flat;
}

const requested = process.argv.slice(2);
const languages = readdirSync(localesDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .filter((language) => language !== sourceLanguage)
  .filter((language) => requested.length === 0 || requested.includes(language))
  .sort();

if (languages.length === 0) {
  console.error("No locales to check (pass language codes or add locales).");
  process.exit(1);
}

const source = loadLanguage(sourceLanguage);
const pluralSuffix = /_(one|two|few|many|other|zero)$/;
let failures = 0;

for (const language of languages) {
  const target = loadLanguage(language);
  const problems: string[] = [];

  // Every source key must exist. A key may be satisfied by its plural family
  // (e.g. English `_other` covered by Russian `_many`), so compare bases too.
  const targetBases = new Set([...target.keys()].map((key) => key.replace(pluralSuffix, "")));
  for (const [key, value] of source) {
    if (target.has(key)) {
      const a = placeholders(value);
      const b = placeholders(target.get(key)!);
      if (a.join(",") !== b.join(",")) {
        problems.push(`${key}: placeholders ${JSON.stringify(b)} != ${JSON.stringify(a)}`);
      }
      const ta = tags(value);
      const tb = tags(target.get(key)!);
      if (ta.join(",") !== tb.join(",")) {
        problems.push(`${key}: tags ${JSON.stringify(tb)} != ${JSON.stringify(ta)}`);
      }
    } else if (!targetBases.has(key.replace(pluralSuffix, ""))) {
      problems.push(`${key}: missing`);
    }
  }

  if (problems.length > 0) {
    failures += 1;
    console.error(`\n${language}: ${problems.length} problem(s)`);
    for (const problem of problems.slice(0, 25)) console.error(`  ${problem}`);
    if (problems.length > 25) console.error(`  …and ${problems.length - 25} more`);
  } else {
    console.log(`${language}: ok (${target.size} keys)`);
  }
}

// ── Usage check: keys referenced from code must exist in the English catalog ──
// Catches components that address a key the catalogs don't define — i18next
// would render the raw key in every language.
const usageProblems: string[] = [];
const referenced = new Set<string>();
const sourceBases = new Set([...source.keys()].map((key) => key.replace(pluralSuffix, "")));

const walkFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return walkFiles(path);
    return /\.(ts|tsx)$/.test(entry.name) ? [path] : [];
  });

for (const file of walkFiles("src")) {
  const lines = readFileSync(file, "utf8").split("\n");
  lines.forEach((line, index) => {
    for (const match of line.matchAll(/\bt\(\s*["']([^"']+)["']/g)) {
      const key = match[1];
      if (referenced.has(key)) continue;
      referenced.add(key);
      const base = key.replace(pluralSuffix, "");
      if (!source.has(key) && !sourceBases.has(base)) {
        usageProblems.push(`${key} (${file}:${index + 1})`);
      }
    }
  });
}

if (usageProblems.length > 0) {
  failures += 1;
  console.error(`\ncode: ${usageProblems.length} referenced key(s) missing from en`);
  for (const problem of usageProblems.slice(0, 25)) console.error(`  ${problem}`);
  if (usageProblems.length > 25) console.error(`  …and ${usageProblems.length - 25} more`);
} else {
  console.log(`code: ok (${referenced.size} referenced keys)`);
}

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log("\nAll locales mirror the English catalog.");
