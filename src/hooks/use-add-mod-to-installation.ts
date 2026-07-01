import { type UseMutationOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";

import type { ModInfo } from "@/lib/types";
import { pathDelimiter } from "@/lib/utils";

import { installedModsQueryKey } from "./use-installed-mods";
import { modUpdatesQueryKey } from "./use-mod-updates";

export const useAddModToInstallation = (
  props?: UseMutationOptions<
    string,
    Error,
    {
      modsDirectory: string;
      mod: ModInfo;
      version: string;
      emitevent: string;
    }
  >,
) => {
  const queryClient = useQueryClient();
  const { onSuccess, ...restProps } = props ?? {};
  return useMutation({
    ...restProps,
    mutationFn: async ({ modsDirectory, mod: { mod }, version, emitevent }) =>
      invoke("download_and_maybe_extract", {
        destpath: `${modsDirectory}${pathDelimiter}Mods`,
        emitevent,
        extract: false,
        url: mod.releases.find((r) => r.modversion === version)?.mainfile,
      }) as Promise<string>,
    onSuccess: async (...args) => {
      const { modsDirectory } = args[1];
      void queryClient.invalidateQueries({ queryKey: installedModsQueryKey(modsDirectory) });
      void queryClient.invalidateQueries({ queryKey: modUpdatesQueryKey(modsDirectory) });
      onSuccess?.(...args);
    },
  });
};
