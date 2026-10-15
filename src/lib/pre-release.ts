/**
 * Release candidates carry "rc" in their version name (e.g. `1.22.0-rc.1`).
 * They are hidden from the version pickers unless the user opts in — see the
 * "show pre-release versions" setting.
 */
export function isPreReleaseVersion(version: string): boolean {
  return version.includes("rc");
}

/** Keeps pre-release versions only when the user has opted into them. */
export function filterPreReleaseVersions(versions: string[], showPreRelease: boolean): string[] {
  return showPreRelease ? versions : versions.filter((version) => !isPreReleaseVersion(version));
}

/**
 * Picks the default entry from an already sorted (descending) version list.
 * Pre-releases are skipped unless they are enabled; when nothing else is
 * available the newest entry wins, matching the pickers' previous behaviour.
 */
export function pickDefaultVersion(versions: string[], showPreRelease: boolean): string {
  const visible = filterPreReleaseVersions(versions, showPreRelease);
  return visible[0] ?? versions[0] ?? "";
}
