import { type UseQueryOptions, keepPreviousData, useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";

import type { OutputMod } from "@/components/pages/mods-browser";

export const installedModsQueryKey = (installationPath: string) => [
  "installationMods",
  installationPath,
];

export const useInstalledMods = (
  installationPath: string,
  props?: Omit<
    UseQueryOptions<{ mods: OutputMod[] }, Error, { mods: OutputMod[] }>,
    "queryKey" | "queryFn"
  >,
) => {
  return useQuery({
    queryFn: () =>
      invoke("get_mods", { path: installationPath }) as Promise<{
        mods: OutputMod[];
      }>,
    queryKey: installedModsQueryKey(installationPath),
    staleTime: Infinity,
    placeholderData: keepPreviousData,
    ...props,
  });
};
