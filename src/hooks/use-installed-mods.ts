import { type UseQueryOptions, keepPreviousData, useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";

import type { ModScanError, OutputMod } from "@/lib/types";

export const installedModsQueryKey = (profilePath: string) => ["profileMods", profilePath];

export const useInstalledMods = (
  profilePath: string,
  props?: Omit<
    UseQueryOptions<
      { mods: OutputMod[]; errors: ModScanError[] },
      Error,
      { mods: OutputMod[]; errors: ModScanError[] }
    >,
    "queryKey" | "queryFn"
  >,
) => {
  return useQuery({
    queryFn: () =>
      invoke("get_mods", { path: profilePath }) as Promise<{
        mods: OutputMod[];
        errors: ModScanError[];
      }>,
    queryKey: installedModsQueryKey(profilePath),
    staleTime: Infinity,
    placeholderData: keepPreviousData,
    ...props,
  });
};
