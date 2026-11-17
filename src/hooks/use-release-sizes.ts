import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { useMemo } from "react";

import type { Release, ReleaseSize } from "@/lib/types";

/**
 * The URLs are part of the key: a mod that publishes while the app is open
 * gets a new release URL, and the sizes of the previous list would not cover
 * it.
 */
export const releaseSizesQueryKey = (modid: string, urls: string[]) => [
  "releaseSizes",
  modid,
  urls,
];

/**
 * Resolves the download size of each release file. The ModDB API has no size
 * field, so the Rust side asks the CDN with HEAD requests; the answer is
 * cached for the session because a release file never changes.
 *
 * Callers enable it when the version list is opened rather than on mount, so
 * merely viewing a mod does not HEAD every release it ever published.
 */
export const useReleaseSizes = (releases: Release[] | undefined, enabled: boolean) => {
  const modid = releases?.[0]?.modidstr ?? "";
  const urls = useMemo(() => (releases ?? []).map((release) => release.mainfile), [releases]);
  return useQuery({
    enabled: enabled && urls.length > 0,
    queryFn: () => invoke("fetch_release_sizes", { urls }) as Promise<ReleaseSize[]>,
    queryKey: releaseSizesQueryKey(modid, urls),
    staleTime: Infinity,
    select: (sizes) => {
      const byUrl = new Map<string, string>();
      for (const size of sizes) {
        if (size.size_display) byUrl.set(size.url, size.size_display);
      }
      return byUrl;
    },
  });
};
