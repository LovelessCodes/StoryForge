import { compareSemverAsc, latestRelease } from "./helpers";
import type { Release } from "./types";

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
