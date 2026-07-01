import { type UseMutationOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";

import { pathDelimiter } from "@/lib/utils";

import { installedModsQueryKey } from "./use-installed-mods";
import type { ModUpdate } from "./use-mod-updates";
import { modUpdatesQueryKey } from "./use-mod-updates";

export const useAddModUpdateToInstallation = (
  props?: UseMutationOptions<
    string,
    Error,
    {
      modsDirectory: string;
      mod: ModUpdate;
      emitevent: string;
    }
  >,
) => {
  const queryClient = useQueryClient();
  const { onSuccess, ...restProps } = props ?? {};
  return useMutation({
    ...restProps,
    mutationFn: async ({ modsDirectory, mod, emitevent }) =>
      invoke("download_and_maybe_extract", {
        destpath: `${modsDirectory}${pathDelimiter}Mods`,
        emitevent,
        extract: false,
        url: mod?.mainfile,
      }) as Promise<string>,
    onSuccess: async (...args) => {
      const { modsDirectory } = args[1];
      void queryClient.invalidateQueries({ queryKey: installedModsQueryKey(modsDirectory) });
      void queryClient.invalidateQueries({ queryKey: modUpdatesQueryKey(modsDirectory) });
      onSuccess?.(...args);
    },
  });
};
