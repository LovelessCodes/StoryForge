import { type UseMutationOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";

import type { ModInfo } from "@/lib/types";
import { pathDelimiter } from "@/lib/utils";
import type { Installation } from "@/stores/installations";

import { installedModsQueryKey } from "./use-installed-mods";
import { modUpdatesQueryKey } from "./use-mod-updates";

export const useAddModToInstallation = (
  props?: UseMutationOptions<
    string,
    Error,
    {
      installation: Installation;
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
    mutationFn: async ({ installation, mod: { mod }, version, emitevent }) =>
      invoke("download_and_maybe_extract", {
        destpath: `${installation.path}${pathDelimiter}Mods`,
        emitevent,
        extract: false,
        url: mod.releases.find((r) => r.modversion === version)?.mainfile,
      }) as Promise<string>,
    onSuccess: async (...args) => {
      const { installation } = args[1];
      await queryClient.invalidateQueries({ queryKey: installedModsQueryKey(installation.path) });
      await queryClient.invalidateQueries({ queryKey: modUpdatesQueryKey(installation.id) });
      onSuccess?.(...args);
    },
  });
};
