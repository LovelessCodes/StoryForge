#!/usr/bin/env bun
/**
 * Upload a Story Forge release to the Vintage Story ModDB (mods.vintagestory.at).
 *
 * The ModDB has no write API, so this replays exactly what the release form does:
 *   1. GET  /edit/release/?modid=<id>  with the session cookie, scrape the `at` token
 *   2. POST the multipart form (modversion, changelog HTML, zip) to the same URL
 *
 * Usage (from the repo root):
 *   MODDB_COOKIE='<cookie header>' bun scripts/moddb-upload-release.ts --tag storyforge-v2.0.2
 *
 * Flags:
 *   --tag <tag>     release tag to publish (required, e.g. storyforge-v2.0.2)
 *   --modid <id>    ModDB mod id (default: 5894)
 *   --repo <o/r>    GitHub repo (default: LovelessCodes/StoryForge)
 *   --zip <path>    use an existing zip instead of building one from the release assets
 *   --dry-run       run the whole pipeline except the upload POST
 *   --force         allow re-upload when the version already exists, and RC tags
 *
 * Env:
 *   MODDB_COOKIE    Cookie header for mods.vintagestory.at (required)
 *   GITHUB_TOKEN    optional, avoids GitHub API rate limits
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const MODDB = "https://mods.vintagestory.at";

interface Options {
  tag: string | null;
  modid: string;
  repo: string;
  zip: string | null;
  dryRun: boolean;
  force: boolean;
}

interface GitHubAsset {
  name: string;
  size: number;
  url: string;
}

interface ModDbRelease {
  modversion: string;
  filename?: string;
}

function abort(message: string): never {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}

function log(message: string): void {
  console.log(`• ${message}`);
}

// ---------------------------------------------------------------- args
function parseArgs(argv: string[]): Options {
  const args: Options = {
    tag: null,
    modid: "5894",
    repo: "LovelessCodes/StoryForge",
    zip: null,
    dryRun: false,
    force: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--tag") args.tag = argv[++i] ?? abort("--tag needs a value");
    else if (arg === "--modid") args.modid = argv[++i] ?? abort("--modid needs a value");
    else if (arg === "--repo") args.repo = argv[++i] ?? abort("--repo needs a value");
    else if (arg === "--zip") args.zip = argv[++i] ?? abort("--zip needs a value");
    else if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--force") args.force = true;
    else abort(`Unknown argument: ${arg}`);
  }
  return args;
}

// ------------------------------------------------------------ changelog
function extractSection(md: string, version: string): string | null {
  const escaped = version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = md.match(new RegExp(`^##\\s+\\[${escaped}\\][^\\n]*\\n`, "m"));
  if (!match) return null;
  const rest = md.slice(match.index! + match[0].length);
  const next = rest.search(/^##\s+/m);
  return (next === -1 ? rest : rest.slice(0, next)).trim();
}

/** Minimal markdown → HTML for the subset CHANGELOG.md uses. */
function mdToHtml(md: string): string {
  const escape = (s: string): string =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const inline = (s: string): string =>
    escape(s)
      .replace(
        /\[([^\]]+)\]\((https?:[^)]+)\)/g,
        '<a href="$2" target="_blank" rel="noopener">$1</a>',
      )
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/(^|\s)\*([^*]+)\*(?=\s|$|[.,!?])/g, "$1<em>$2</em>");

  const out: string[] = [];
  let inList = false;
  const closeList = (): void => {
    if (inList) {
      out.push("</ul>");
      inList = false;
    }
  };
  for (const raw of md.split(/\r?\n/)) {
    const line = raw.trimEnd();
    if (/^###\s+/.test(line)) {
      closeList();
      out.push(`<h3>${inline(line.replace(/^###\s+/, ""))}</h3>`);
    } else if (/^##\s+/.test(line)) {
      closeList();
      out.push(`<h2>${inline(line.replace(/^##\s+/, ""))}</h2>`);
    } else if (/^[-*]\s+/.test(line)) {
      if (!inList) {
        out.push("<ul>");
        inList = true;
      }
      out.push(`<li>${inline(line.replace(/^[-*]\s+/, ""))}</li>`);
    } else if (!line) {
      closeList();
    } else {
      closeList();
      out.push(`<p>${inline(line)}</p>`);
    }
  }
  closeList();
  return out.join("\n");
}

// ---------------------------------------------------------------- main
const args = parseArgs(process.argv.slice(2));
const tag = args.tag ?? abort("--tag is required (e.g. --tag storyforge-v2.0.2)");
const cookie = process.env.MODDB_COOKIE;
if (!cookie)
  abort("MODDB_COOKIE is not set. Refresh it with the dump-cookies helper and update the secret.");

const version = tag.replace(/^storyforge-v/, "");
if (!/^\d+\.\d+\.\d+(-rc\.\d+)?$/.test(version))
  abort(`Tag does not look like a Story Forge release: ${tag}`);
if (version.includes("-rc.") && !args.force) {
  log(
    `Tag ${tag} is a release candidate — ModDB releases skip RCs (use --force to override). Skipping.`,
  );
  process.exit(0);
}

const ghHeaders: Record<string, string> = {
  Accept: "application/vnd.github+json",
  "User-Agent": "storyforge-moddb-release",
  ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
};

// 1) Idempotency: is this version already on ModDB?
log(`Checking moddb for existing ${version}…`);
{
  const res = await fetch(`${MODDB}/api/mod/${args.modid}`, { headers: { "User-Agent": UA } });
  const api = (await res.json()) as { mod?: { releases?: ModDbRelease[] } };
  const existing = api.mod?.releases?.some((release) => release.modversion === version) ?? false;
  if (existing && !args.force) {
    log(`${version} is already on ModDB — nothing to do (use --force to upload anyway).`);
    process.exit(0);
  }
  if (existing) log(`${version} already exists, but --force was passed.`);
}

// 2) Build the zip (or reuse one).
let zipPath: string;
let zipName: string;
if (args.zip) {
  zipPath = args.zip;
  zipName = zipPath.split("/").pop() ?? abort(`Cannot derive a file name from --zip ${zipPath}`);
  if (!existsSync(zipPath)) abort(`--zip file not found: ${zipPath}`);
  log(`Using existing zip: ${zipPath}`);
} else {
  log(`Fetching release ${tag} from GitHub…`);
  const releaseRes = await fetch(`https://api.github.com/repos/${args.repo}/releases/tags/${tag}`, {
    headers: ghHeaders,
  });
  if (!releaseRes.ok) abort(`GitHub release lookup failed: HTTP ${releaseRes.status}`);
  const release = (await releaseRes.json()) as { assets: GitHubAsset[] };
  const wanted = release.assets.filter(
    (asset) =>
      asset.name.endsWith("_aarch64.dmg") ||
      asset.name.endsWith("_x64.dmg") ||
      asset.name.endsWith("_x64-setup.exe"),
  );
  if (wanted.length !== 3) {
    abort(
      `Expected 3 assets (aarch64 dmg, x64 dmg, x64 setup.exe), found ${wanted.length}: ${wanted
        .map((asset) => asset.name)
        .join(", ")}`,
    );
  }
  const dir = mkdtempSync(join(tmpdir(), "moddb-release-"));
  for (const asset of wanted) {
    log(`Downloading ${asset.name} (${(asset.size / 1024 / 1024).toFixed(1)} MB)…`);
    const res = await fetch(asset.url, {
      headers: { ...ghHeaders, Accept: "application/octet-stream" },
      redirect: "follow",
    });
    if (!res.ok) abort(`Asset download failed: ${asset.name} (HTTP ${res.status})`);
    writeFileSync(join(dir, asset.name), Buffer.from(await res.arrayBuffer()));
  }
  zipName = `storyforge-v${version}.zip`;
  zipPath = join(dir, zipName);
  try {
    execFileSync("zip", ["-X", "-q", "-j", zipPath, ...wanted.map((asset) => asset.name)], {
      cwd: dir,
    });
  } catch {
    abort("`zip` is not available — install it (CI: apt-get install zip) or pass --zip.");
  }
  log(`Built ${zipName} (${(readFileSync(zipPath).length / 1024 / 1024).toFixed(1)} MB).`);
}

// 3) Changelog from CHANGELOG.md at the tag (fallback: placeholder).
let changelogHtml: string;
{
  const res = await fetch(`https://raw.githubusercontent.com/${args.repo}/${tag}/CHANGELOG.md`, {
    headers: { "User-Agent": UA },
  });
  const section = res.ok ? extractSection(await res.text(), version) : null;
  if (section) {
    changelogHtml = `<h2>Story Forge v${version}</h2>\n${mdToHtml(section)}`;
    log(`Changelog taken from CHANGELOG.md (${section.length} chars of markdown).`);
  } else {
    changelogHtml = `<h2>Story Forge v${version}</h2>\n<p>See the changelog on GitHub.</p>`;
    log("No CHANGELOG.md section found — using a placeholder changelog.");
  }
}

// 4) Session check + action token.
const editUrl = `${MODDB}/edit/release/?modid=${args.modid}`;
const cookieSegments = cookie.split(";").filter((part) => part.trim()).length;
log(
  `Cookie header: ${cookieSegments} segment(s); PHPSESSID ${cookie.includes("PHPSESSID") ? "present" : "MISSING"}; ` +
    `vs_websessionkey ${cookie.includes("vs_websessionkey") ? "present" : "MISSING"}.`,
);
log("Checking the ModDB session and scraping the action token…");
const pageRes = await fetch(editUrl, {
  headers: { Cookie: cookie, "User-Agent": UA },
  redirect: "follow",
});
const pageHtml = await pageRes.text();
if (pageRes.status === 401) {
  abort(
    "MODDB_COOKIE was rejected by the ModDB (HTTP 401): the session has expired, or the secret value is malformed. " +
      "Log in again, copy the `Cookie` request header, and update the secret.",
  );
}
if (pageRes.url.includes("account.vintagestory.at") || /name="password"/.test(pageHtml)) {
  abort(
    "MODDB_COOKIE is expired or invalid (redirected to login). Log in again and refresh the secret.",
  );
}
const token = pageHtml.match(/name="at"\s+value="([^"]+)"/)?.[1];
if (!token)
  abort(
    `Could not find the action token on the edit page (HTTP ${pageRes.status}, final URL ${pageRes.url}, ` +
      `${pageHtml.length} bytes) — layout may have changed, or the cookie is invalid.`,
  );
log("Session valid, token found.");

if (args.dryRun) {
  log("DRY RUN — everything validated; upload skipped.");
  process.exit(0);
}

// 5) Upload.
log(`Uploading ${zipName} as v${version}…`);
const form = new FormData();
form.append("at", token);
form.append("save", "1");
form.append("assetid", "0");
form.append("modid", args.modid);
form.append("numsaved", "0");
form.append("saveandback", "0");
form.append("modversion", version);
form.append("text", changelogHtml);
form.append("newfile", new Blob([readFileSync(zipPath)], { type: "application/zip" }), zipName);

const postRes = await fetch(editUrl, {
  method: "POST",
  headers: {
    Cookie: cookie,
    "User-Agent": UA,
    Referer: editUrl,
    Origin: MODDB,
  },
  body: form,
  redirect: "follow",
});
const postBody = await postRes.text();
const created = postRes.url.includes("assetid=") || postBody.includes("Created Release");
if (!created) {
  abort(
    `Upload did not look successful (HTTP ${postRes.status}, final URL ${postRes.url}). ` +
      "If this is a cookie expiry or layout change, fix and re-run with --force.",
  );
}
log(`Upload accepted (HTTP ${postRes.status}).`);

// 6) Verify via the public API.
for (let attempt = 0; attempt < 5; attempt++) {
  await new Promise((resolve) => setTimeout(resolve, 2000));
  const res = await fetch(`${MODDB}/api/mod/${args.modid}`, { headers: { "User-Agent": UA } });
  const api = (await res.json()) as { mod?: { releases?: ModDbRelease[] } };
  const release = api.mod?.releases?.find((r) => r.modversion === version);
  if (release) {
    log(`Verified on ModDB: ${release.modversion} — ${release.filename} (${MODDB}/storyforge)`);
    process.exit(0);
  }
}
abort(
  "Upload was accepted but the release did not appear in the public API — check the ModDB page.",
);
