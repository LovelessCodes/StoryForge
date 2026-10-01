import { platform } from "@tauri-apps/plugin-os";

import type { Profile } from "@/stores/profiles";

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
 * Returns the final component of a native path, handling both separators.
 *
 * Tauri returns platform-native paths (`C:\...` on Windows), so splitting on
 * "/" alone silently returns the whole path there.
 */
export function pathBasename(path: string): string {
  return path.split(/[/\\]/).filter(Boolean).pop() ?? "";
}

/** Builds the full profiles directory path. */
export function buildProfilesPath(parentPath: string, subdir = "profiles"): string {
  return `${parentPath}${pathDelimiter}${subdir}`;
}

/** Builds the full versions directory path. */
export function buildVersionsPath(parentPath: string, subdir = "versions"): string {
  return `${parentPath}${pathDelimiter}${subdir}`;
}

/** Builds a path to a specific profile. */
export function buildProfilePath(
  parentPath: string,
  profileFolderName: string,
  subdir = "profiles",
): string {
  return `${parentPath}${pathDelimiter}${subdir}${pathDelimiter}${profileFolderName}`;
}

/** Builds a path to a specific version. */
export function buildVersionPath(
  parentPath: string,
  versionName: string,
  subdir = "versions",
): string {
  return `${parentPath}${pathDelimiter}${subdir}${pathDelimiter}${versionName}`;
}

/** Sorts profiles: favorites first, then most recently played. */
export const sortProfiles = (a: Profile, b: Profile) => {
  if (a.favorite && !b.favorite) return -1;
  if (!a.favorite && b.favorite) return 1;
  const aTime = a.lastTimePlayed ? new Date(a.lastTimePlayed).getTime() : 0;
  const bTime = b.lastTimePlayed ? new Date(b.lastTimePlayed).getTime() : 0;
  return bTime - aTime;
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
