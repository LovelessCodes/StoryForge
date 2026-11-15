import { type UseQueryOptions, useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";

export interface LatestRelease {
  /** Release version without the tag prefix, e.g. `2.0.11`. */
  version: string;
  /** Page the bundle can be downloaded from. */
  url: string;
}

/**
 * Newest published release on GitHub.
 *
 * Only needed where the bundled updater cannot run (Flatpak), because the app
 * is not on Flathub yet and a hand-installed bundle would otherwise never hear
 * about a newer build. `null` means "no news": offline, rate limited, or no
 * usable tag.
 */
export const useLatestRelease = (
  props?: Omit<UseQueryOptions<LatestRelease | null, Error>, "queryKey" | "queryFn">,
) =>
  useQuery({
    queryFn: () => invoke<LatestRelease | null>("latest_release"),
    queryKey: ["latest-release"],
    staleTime: 1000 * 60 * 60,
    ...props,
  });
