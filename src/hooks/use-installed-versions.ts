import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { useMemo } from "react";

import { optimumVersionName } from "@/lib/helpers";

export const installedVersionsQueryKey = () => ["installedVersions"] as const;

export type InstalledVersion = {
  name: string;
  size_bytes: number;
  size_display: string;
  /** Full path of the version folder (managed or linked). */
  path: string;
  /** Linked from outside the versions folder instead of downloaded here. */
  external: boolean;
  /** Where a linked version came from ("VS Launcher", "MVL", …). */
  source: string | null;
  /** Optimum version this folder is patched with, when it is an Optimum build. */
  optimum_version: string | null;
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
 * is installed, otherwise its Optimum build. `null` when neither is installed.
 */
export function resolveInstalledVersionName(
  versions: InstalledVersion[],
  gameVersion: string,
): string | null {
  if (versions.some((version) => version.name === gameVersion)) return gameVersion;
  const optimum = optimumVersionName(gameVersion);
  return versions.some((version) => version.name === optimum) ? optimum : null;
}
