/**
 * Whether `candidate` is a later release than `current`.
 *
 * Versions are dotted numbers (`2.0.11`); a pre-release suffix (`1.23.0-rc.1`)
 * does not count as newer than the release it precedes.
 */
export function isNewerVersion(candidate: string, current: string): boolean {
  const left = versionParts(candidate);
  const right = versionParts(current);
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) return difference > 0;
  }
  return false;
}

function versionParts(version: string): number[] {
  return version
    .split("-")[0]
    .split(".")
    .map((part) => Number.parseInt(part, 10))
    .filter((part) => Number.isFinite(part));
}
