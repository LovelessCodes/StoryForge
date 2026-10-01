import { type UseMutationOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";

import { pathDelimiter } from "@/lib/helpers";
import type { ModInfo } from "@/lib/types";

import { installedModsQueryKey } from "./use-installed-mods";
import { modUpdatesQueryKey } from "./use-mod-updates";

export const useAddModToProfile = (
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
        params: {
          destpath: `${modsDirectory}${pathDelimiter}Mods`,
          emitevent,
          extract: false,
          url: mod.releases.find((r) => r.modversion === version)?.mainfile,
        },
      }) as Promise<string>,
    onSuccess: async (...args) => {
      const { modsDirectory } = args[1];
      void queryClient.invalidateQueries({ queryKey: installedModsQueryKey(modsDirectory) });
      void queryClient.invalidateQueries({ queryKey: modUpdatesQueryKey(modsDirectory) });
      onSuccess?.(...args);
    },
  });
};
