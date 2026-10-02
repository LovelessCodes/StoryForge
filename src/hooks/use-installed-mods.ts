import { type UseQueryOptions, keepPreviousData, useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";

import type { OutputMod } from "@/lib/types";

export const installedModsQueryKey = (profilePath: string) => ["profileMods", profilePath];

export const useInstalledMods = (
  profilePath: string,
  props?: Omit<
    UseQueryOptions<{ mods: OutputMod[] }, Error, { mods: OutputMod[] }>,
    "queryKey" | "queryFn"
  >,
) => {
  return useQuery({
    queryFn: () =>
      invoke("get_mods", { path: profilePath }) as Promise<{
        mods: OutputMod[];
      }>,
    queryKey: installedModsQueryKey(profilePath),
    staleTime: Infinity,
    placeholderData: keepPreviousData,
    ...props,
  });
};
