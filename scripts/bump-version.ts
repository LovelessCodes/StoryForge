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
const [major, minor, patch] = current.split(".").map(Number);

const bumps = {
  patch: `${major}.${minor}.${patch + 1}`,
  minor: `${major}.${minor + 1}.0`,
  major: `${major + 1}.0.0`,
};

console.log(`Current version: ${current}`);

const choice = await pick(
  [`patch  →  ${bumps.patch}`, `minor  →  ${bumps.minor}`, `major  →  ${bumps.major}`],
  "What kind of bump?",
);

const picked = choice.includes("patch") ? "patch" : choice.includes("minor") ? "minor" : "major";
const newVersion = bumps[picked];

const ok = await confirm(`\nBump from ${current} to ${newVersion}?`);
if (!ok) {
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
writeJSON("src-tauri/tauri.conf.json", tauriConf);
console.log(`  tauri.conf.json → ${newVersion}`);

// 3. Cargo.toml — replace version line directly (avoids cargo-edit dependency)
const cargoToml = readFileSync(join(ROOT, "src-tauri/Cargo.toml"), "utf-8");
const updatedToml = cargoToml.replace(/^version\s*=\s*"[^"]*"/m, `version = "${newVersion}"`);
writeFileSync(join(ROOT, "src-tauri/Cargo.toml"), updatedToml);
console.log(`  Cargo.toml → ${newVersion}`);

// 4. Cargo.lock — regenerate from src-tauri dir
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

// 6. Commit & push to release
git(
  "add",
  "package.json",
  "src-tauri/tauri.conf.json",
  "src-tauri/Cargo.toml",
  "src-tauri/Cargo.lock",
);
git("commit", "-m", `chore: bump version to ${newVersion}`);
git("push", "origin", "HEAD:release");

// 7. Tag & push
const tag = `storyforge-v${newVersion}`;
git("tag", "-a", tag, "-m", `Story Forge v${newVersion}`);
git("push", "origin", tag);

if (DRY_RUN) {
  console.log("\n🧪 Dry run complete. Files updated on disk but nothing committed or pushed.");
  console.log("   Run without --dry-run to commit and push.");
} else {
  console.log(`\nDone! Pushed tag ${tag} — publish workflow should start.`);
}
