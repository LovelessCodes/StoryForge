import { invoke } from "@tauri-apps/api/core";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { platform } from "@tauri-apps/plugin-os";
import { type ClassValue, clsx } from "clsx";
import { toast } from "sonner";
import { twMerge } from "tailwind-merge";

import type { OutputMod } from "@/components/pages/mods-browser";
import type { Installation } from "@/stores/installations";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function capitalizeFirstLetter(string: string) {
  return string.charAt(0).toUpperCase() + string.slice(1);
}

export function makeStringFolderSafe(string: string) {
  return string.replace(/[^a-z0-9]/gi, "_").toLowerCase();
}

function parseVer(v: string) {
  const parts = String(v).trim().split(".");
  const major = Number(parts[0] ?? 0) || 0;
  const minor = Number(parts[1] ?? 0) || 0;
  const patch = Number(parts[2] ?? 0) || 0;
  return [major, minor, patch];
}

export function compareSemverDesc(a: string, b: string) {
  const [ma, mi, pa] = parseVer(a);
  const [mb, mj, pb] = parseVer(b);
  if (ma !== mb) return mb - ma;
  if (mi !== mj) return mj - mi;
  return pb - pa;
}

export function compareSemverAsc(a: string, b: string) {
  const [ma, mi, pa] = parseVer(a);
  const [mb, mj, pb] = parseVer(b);
  if (ma !== mb) return ma - mb;
  if (mi !== mj) return mi - mj;
  return pa - pb;
}

/** Finds the latest mod version — releases[] isn't guaranteed sorted by version. */
export function latestRelease<T extends { modversion: string }>(
  releases: T[] | undefined,
): T | undefined {
  if (!releases || releases.length === 0) return undefined;
  return releases.reduce((latest, release) =>
    compareSemverDesc(release.modversion, latest.modversion) < 0 ? release : latest,
  );
}

export const zipfolderprefix = () => {
  const currentPlatform = platform();
  const pf = currentPlatform.charAt(0).toLowerCase();
  if (pf === "w") return "app/";
  if (pf === "m") return "*.app/";
  return "";
};

export const isMac = platform() === "macos";

export const modifierLabel = isMac ? "⌘" : "Ctrl+";

export const isWindows = platform() === "windows";

export const pathDelimiter = isWindows ? "\\" : "/";

/**
 * Builds the full installations directory path
 * @param parentPath - The parent directory (from settings or app folder)
 * @param subdir - The subdirectory name (from settings, default: "installations")
 * @returns The full path to the installations directory
 */
export function buildInstallationsPath(parentPath: string, subdir = "installations"): string {
  return `${parentPath}${pathDelimiter}${subdir}`;
}

/**
 * Builds the full versions directory path
 * @param parentPath - The parent directory (from settings or app folder)
 * @param subdir - The subdirectory name (from settings, default: "versions")
 * @returns The full path to the versions directory
 */
export function buildVersionsPath(parentPath: string, subdir = "versions"): string {
  return `${parentPath}${pathDelimiter}${subdir}`;
}

/**
 * Builds a path to a specific installation
 * @param parentPath - The parent directory (from settings or app folder)
 * @param installationName - The name of the installation
 * @param subdir - The subdirectory name (from settings, default: "installations")
 * @returns The full path to the specific installation
 */
export function buildInstallationPath(
  parentPath: string,
  installationName: string,
  subdir = "installations",
): string {
  return `${parentPath}${pathDelimiter}${subdir}${pathDelimiter}${installationName}`;
}

/**
 * Builds a path to a specific version
 * @param parentPath - The parent directory (from settings or app folder)
 * @param versionName - The version identifier
 * @param subdir - The subdirectory name (from settings, default: "versions")
 * @returns The full path to the specific version
 */
export function buildVersionPath(
  parentPath: string,
  versionName: string,
  subdir = "versions",
): string {
  return `${parentPath}${pathDelimiter}${subdir}${pathDelimiter}${versionName}`;
}

/**
 * Sorts installations by favorite status and last played time
 * Favorites are prioritized, and within each group, installations are sorted
 * by lastTimePlayed in descending order (most recent first).
 * @param installations - Array of installations to sort
 * @returns Sorted array of installations
 */
export const sortInstallations = (a: Installation, b: Installation) => {
  // Sort favorites first
  if (a.favorite && !b.favorite) return -1;
  if (!a.favorite && b.favorite) return 1;
  // Then sort by lastTimePlayed descending
  const aTime = a.lastTimePlayed ? new Date(a.lastTimePlayed).getTime() : 0;
  const bTime = b.lastTimePlayed ? new Date(b.lastTimePlayed).getTime() : 0;
  return bTime - aTime;
};

/**
 * Exports the installation data (mods, name, version) to clipboard as JSON
 * @param installation - The installation to export
 */
export const exportInstallation = async ({ installation }: { installation: Installation }) => {
  const installationMods = await invoke<{ mods: OutputMod[] }>("get_mods", {
    path: installation.path,
  });
  const data = {
    mods: installationMods.mods.map((m) => `${m.modid}@${m.version}`).join(","),
    name: installation.name,
    version: installation.version,
  };
  // Copy to clipboard
  await writeText(JSON.stringify(data, null));
  toast.success("Installation copied to clipboard");
};

/**
 * Variants for the item animations
 */
export const itemVariants = {
  exit: { opacity: 0, transition: { duration: 0.15 }, y: -4 },
  hidden: { opacity: 0, y: 8 },
  show: (i: number) => ({
    opacity: 1,
    transition: {
      damping: 32,
      delay: i * 0.05, // 50ms incremental stagger based on current index
      stiffness: 420,
      type: "spring" as const,
    },
    y: 0,
  }),
};

export const stripped = (str: string) =>
  str
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();

/** Simple 32-bit hash of a string, returned as base-36. */
export function hashPath(path: string): string {
  let hash = 0;
  for (let i = 0; i < path.length; i++) {
    const char = path.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36);
}
