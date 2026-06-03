import { type UseMutationOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";

import { pathDelimiter } from "@/lib/utils";
import type { Installation } from "@/stores/installations";

import { installedModsQueryKey } from "./use-installed-mods";
import type { ModUpdate } from "./use-mod-updates";
import { modUpdatesQueryKey } from "./use-mod-updates";

export const useAddModUpdateToInstallation = (
  props?: UseMutationOptions<
    string,
    Error,
    {
      installation: Installation;
      mod: ModUpdate;
      emitevent: string;
    }
  >,
) => {
  const queryClient = useQueryClient();
  const { onSuccess, ...restProps } = props ?? {};
  return useMutation({
    ...restProps,
    mutationFn: async ({ installation, mod, emitevent }) =>
      invoke("download_and_maybe_extract", {
        destpath: `${installation.path}${pathDelimiter}Mods`,
        emitevent,
        extract: false,
        url: mod?.mainfile,
      }) as Promise<string>,
    onSuccess: async (...args) => {
      const { installation } = args[1];
      await queryClient.invalidateQueries({ queryKey: installedModsQueryKey(installation.path) });
      await queryClient.invalidateQueries({ queryKey: modUpdatesQueryKey(installation.id) });
      onSuccess?.(...args);
    },
  });
};
