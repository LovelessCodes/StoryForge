/**
 * Cross-path lock for game-version downloads.
 *
 * Version downloads can be started from two independent places (the download
 * manager queue and `useDownloadVersion`). Rust's helper deletes the
 * destination directory when a fresh extraction starts, so two concurrent
 * downloads of the same version would corrupt each other. Claiming a version
 * before invoking keeps them serialized.
 */
const activeVersionDownloads = new Set<string>();

/** Claims a version download. Returns false when one is already running. */
export function claimVersionDownload(version: string): boolean {
  if (activeVersionDownloads.has(version)) return false;
  activeVersionDownloads.add(version);
  return true;
}

/** Releases a version download; safe to call without a successful claim. */
export function releaseVersionDownload(version: string): void {
  activeVersionDownloads.delete(version);
}
