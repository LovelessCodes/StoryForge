import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { useMemo } from "react";

import { optimumVersionName, vulkanStoryVersionName } from "@/lib/helpers";

export const installedVersionsQueryKey = () => ["installedVersions"] as const;

export type InstalledVersion = {
  name: string;
  size_bytes: number;
  size_display: string;
  path: string;
  external: boolean;
  source: string | null;
  optimum_version: string | null;
  vulkanstory_version: string | null;
};

export const useInstalledVersions = () => {
  return useQuery({
    queryFn: () => invoke<InstalledVersion[]>("get_installed_versions"),
    queryKey: installedVersionsQueryKey(),
    staleTime: Infinity,
    placeholderData: keepPreviousData,
  });
};

/** Convenience: just the version strings (for backward compat) */
export const useInstalledVersionNames = () => {
  const { data } = useInstalledVersions();
  return useMemo(() => (data ?? []).map((v) => v.name), [data]);
};

/**
 * The installed folder a game version resolves to: the exact version when it
 * is installed, otherwise its Optimum build, otherwise its VulkanStory build.
 * `null` when none of them is installed.
 */
export function resolveInstalledVersionName(
  versions: InstalledVersion[],
  gameVersion: string,
): string | null {
  if (versions.some((version) => version.name === gameVersion)) return gameVersion;
  const optimum = optimumVersionName(gameVersion);
  if (versions.some((version) => version.name === optimum)) return optimum;
  const vulkanstory = vulkanStoryVersionName(gameVersion);
  return versions.some((version) => version.name === vulkanstory) ? vulkanstory : null;
}
