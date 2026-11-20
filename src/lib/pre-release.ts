/**
 * Vintage Story marks unfinished builds with a hyphenated suffix: release
 * candidates are `1.22.0-rc.1`, previews are `1.23.0-pre.1`. Story Forge's own
 * client forks append `+optimum`/`+vulkanstory` instead, so only the hyphenated
 * form is a pre-release — a fork of a stable build stays a stable build.
 */
const PRE_RELEASE_SUFFIX = /^v?\d+\.\d+\.\d+-[0-9A-Za-z]/;

export function isPreReleaseVersion(version: string): boolean {
  return PRE_RELEASE_SUFFIX.test(version);
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
