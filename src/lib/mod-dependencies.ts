import { compareSemverAsc, latestRelease } from "./helpers";
import type { OutputMod, Release } from "./types";

/**
 * The release to install for a dependency.
 *
 * The dependency's version value is a minimum requirement: prefer the newest
 * release that satisfies it, fall back to the newest release when nothing does
 * (the game only warns about a mismatch) or when the requirement is empty.
 */
export function pickDependencyRelease(
  releases: Release[] | undefined,
  constraint: string,
): Release | undefined {
  const latest = latestRelease(releases);
  if (!latest) return undefined;

  const wanted = constraint.trim();
  if (!wanted) return latest;

  const satisfying = (releases ?? []).filter(
    (release) => compareSemverAsc(release.modversion, wanted) >= 0,
  );
  return latestRelease(satisfying) ?? latest;
}

export type MissingDependency = {
  modid: string;
  /** Version requirement from `modinfo.json` (empty when unconstrained). */
  constraint: string;
  /** Installed mods whose `modinfo.json` requires this dependency. */
  requiredBy: string[];
};

/** Dependency ids the game itself provides: its version entry and the bundled mods. */
const BUILT_IN_MODIDS = new Set(["game", "essentials", "survival", "creative"]);

/**
 * Dependencies named by the installed mods that are not installed themselves.
 *
 * The `game` entry is the game version requirement, not a mod, the built-in
 * mods ship with the game rather than in the profile's Mods folder, and modids
 * are compared case-insensitively (zip metadata is inconsistent about casing).
 */
export function findMissingDependencies(mods: OutputMod[] | undefined): MissingDependency[] {
  const installed = new Set((mods ?? []).map((mod) => mod.modid.toLowerCase()));
  const missing = new Map<string, MissingDependency>();

  for (const mod of mods ?? []) {
    for (const [rawId, constraint] of Object.entries(mod.dependencies ?? {})) {
      const id = rawId.trim().toLowerCase();
      if (!id || BUILT_IN_MODIDS.has(id) || installed.has(id)) continue;

      const entry = missing.get(id) ?? { modid: id, constraint: "", requiredBy: [] };
      if (!entry.constraint) entry.constraint = constraint.trim();
      if (!entry.requiredBy.includes(mod.name)) entry.requiredBy.push(mod.name);
      missing.set(id, entry);
    }
  }

  return [...missing.values()].sort((a, b) => a.modid.localeCompare(b.modid));
}
