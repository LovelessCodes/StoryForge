import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";

const ROOT = join(import.meta.dirname, "..");
const DRY_RUN = process.argv.includes("--dry-run");

if (DRY_RUN) {
  console.log("🧪 DRY RUN — files will be updated but nothing committed or pushed.\n");
}

function readJSON(path: string) {
  return JSON.parse(readFileSync(join(ROOT, path), "utf-8"));
}

function writeJSON(path: string, data: unknown) {
  writeFileSync(join(ROOT, path), JSON.stringify(data, null, 2) + "\n");
}

function git(...args: string[]) {
  if (DRY_RUN) {
    console.log(`  [dry-run] git ${args.join(" ")}`);
    return;
  }
  const r = spawnSync("git", args, { cwd: ROOT, stdio: "inherit" });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

function sh(cmd: string, args: string[]) {
  if (DRY_RUN) {
    console.log(`  [dry-run] ${cmd} ${args.join(" ")}`);
    return;
  }
  const r = spawnSync(cmd, args, { cwd: ROOT, stdio: "inherit" });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

async function pick(options: string[], prompt: string): Promise<string> {
  console.log(`\n${prompt}`);
  options.forEach((o, i) => console.log(`  ${i + 1}. ${o}`));

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question("> ", (answer) => {
      rl.close();
      const i = Number.parseInt(answer, 10) - 1;
      resolve(options[i] ?? options[0]);
    });
  });
}

async function confirm(msg: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`${msg} [Y/n] `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() !== "n");
    });
  });
}

// ── main ──

const pkg = readJSON("package.json");
const current: string = pkg.version;

// Parse semver: <major>.<minor>.<patch>[-<prePrefix>.<preNum>]
const preReleaseRe = /^(\d+\.\d+\.\d+)-(.+)\.(\d+)$/;
const preMatch = current.match(preReleaseRe);
const baseVersion = preMatch ? preMatch[1] : current;
const [bMajor, bMinor, bPatch] = baseVersion.split(".").map(Number);

interface BumpOption {
  label: string;
  value: string;
}

const bumps: BumpOption[] = [
  { label: "patch", value: `${bMajor}.${bMinor}.${bPatch + 1}` },
  { label: "minor", value: `${bMajor}.${bMinor + 1}.0` },
  { label: "major", value: `${bMajor + 1}.0.0` },
];

if (preMatch) {
  const prePrefix = preMatch[2];
  const preNum = Number.parseInt(preMatch[3], 10);
  bumps.push({
    label: "pre-release bump",
    value: `${baseVersion}-${prePrefix}.${preNum + 1}`,
  });
  bumps.push({ label: "finalize", value: baseVersion });
} else {
  // Pre-releases target the next version at each bump level
  const prBumps: BumpOption[] = bumps.map((b) => ({
    label: `pre-release (${b.label})`,
    value: `${b.value}-rc.0`,
  }));
  bumps.push(...prBumps);
}

console.log(`Current version: ${current}`);

const choice = await pick(
  bumps.map((b) => `${b.label.padEnd(22)} →  ${b.value}`),
  "What kind of bump?",
);

// Match by index (not substring — "patch" would match inside "pre-release (patch)")
const idx = bumps.findIndex((b) => choice.startsWith(b.label.padEnd(22)));
const picked = bumps[idx >= 0 ? idx : 0];
const newVersion = picked.value;
const isPreRelease = picked.label.startsWith("pre-release");
const isFinalize = picked.label === "finalize";

const okMsg = isFinalize
  ? `\nFinalize ${current} → ${newVersion}?`
  : `\nBump from ${current} to ${newVersion}?`;

if (!(await confirm(okMsg))) {
  console.log("Canceled.");
  process.exit(0);
}

// 1. package.json
pkg.version = newVersion;
writeJSON("package.json", pkg);
console.log(`  package.json → ${newVersion}`);

// 2. tauri.conf.json
const tauriConf = readJSON("src-tauri/tauri.conf.json");
tauriConf.version = newVersion;
// MSI requires numeric major.minor.patch.build — derive from base semver
const newBaseVersion = newVersion.replace(/-rc\.\d+$/, "");
tauriConf.bundle.windows.wix.version = `${newBaseVersion}.0`;
writeJSON("src-tauri/tauri.conf.json", tauriConf);
console.log(`  tauri.conf.json → ${newVersion}`);

// 3. Cargo.toml
const cargoToml = readFileSync(join(ROOT, "src-tauri/Cargo.toml"), "utf-8");
const updatedToml = cargoToml.replace(/^version\s*=\s*"[^"]*"/m, `version = "${newVersion}"`);
writeFileSync(join(ROOT, "src-tauri/Cargo.toml"), updatedToml);
console.log(`  Cargo.toml → ${newVersion}`);

// 4. Cargo.lock
const lockResult = spawnSync("cargo", ["generate-lockfile"], {
  cwd: join(ROOT, "src-tauri"),
  stdio: DRY_RUN ? "ignore" : "inherit",
});
if (lockResult.status === 0) {
  console.log("  Cargo.lock regenerated");
} else {
  console.log("  Cargo.lock skipped (cargo not available?)");
}

// 5. Format
sh("bun", ["run", "fmt"]);
console.log("  formatted");

// 6. Commit
git(
  "add",
  "package.json",
  "src-tauri/tauri.conf.json",
  "src-tauri/Cargo.toml",
  "src-tauri/Cargo.lock",
);
git("commit", "-m", `chore: bump version to ${newVersion}`);

// 7. Push & tag
const tag = `storyforge-v${newVersion}`;
if (isPreRelease) {
  // Pre-release: tag only, don't push commit to release branch
  git("tag", "-a", tag, "-m", `Story Forge ${newVersion} (pre-release)`);
  git("push", "origin", tag);
  console.log("\n  ⚠ Pre-release: tag pushed but commit NOT pushed to release branch.");
  console.log("    Push manually when ready or use 'finalize' to cut a stable release.");
} else {
  // Stable release or finalize: push to release branch + tag
  git("push", "origin", "HEAD:release");
  git("tag", "-a", tag, "-m", `Story Forge v${newVersion}`);
  git("push", "origin", tag);
}

if (DRY_RUN) {
  console.log("\n🧪 Dry run complete. Files updated on disk but nothing committed or pushed.");
  console.log("   Run without --dry-run to commit and push.");
} else {
  console.log(`\nDone! Pushed tag ${tag} — publish workflow should start.`);
}
