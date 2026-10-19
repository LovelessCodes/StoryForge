import { type UseMutationOptions, useMutation, useQueryClient } from "@tanstack/react-query";

import { hashPath, pathDelimiter } from "@/lib/helpers";
import type { ModInfo } from "@/lib/types";

import { invalidateQueriesFor, useDownloadManager, waitForDownload } from "./use-download-manager";

/**
 * Queues a mod install into the downloads manager (progress and pause/cancel
 * live in the Downloads sheet) and resolves once it finishes.
 *
 * This mutation owns the cache sync for its download: the queue entry asks the
 * manager to skip its own refresh (`refreshOwnedByCaller`), and `onSuccess`
 * refreshes the profile's installed-mods and mod-updates lists.
 */
export const useAddModToProfile = (
  props?: UseMutationOptions<
    string,
    Error,
    {
      modsDirectory: string;
      mod: ModInfo;
      version: string;
      destinationLabel?: string;
    }
  >,
) => {
  const { startModDownload } = useDownloadManager();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      modsDirectory,
      mod: { mod },
      version,
      destinationLabel,
    }: {
      modsDirectory: string;
      mod: ModInfo;
      version: string;
      destinationLabel?: string;
    }) => {
      const release = mod.releases.find((r) => r.modversion === version);
      if (!release?.mainfile) {
        throw new Error(`No download available for ${mod.name} ${version}`);
      }
      // The token hashes the directory the file lands in (not the profile
      // root), so two entries targeting the same file share one token.
      const destpath = `${modsDirectory}${pathDelimiter}Mods`;
      const token = `mod:${mod.modid}:${version}:${hashPath(destpath)}`;
      startModDownload({
        token,
        label: `${mod.name} v${version}`,
        detail: destinationLabel ?? null,
        url: release.mainfile,
        destpath,
        modsDirectory,
        refreshOwnedByCaller: true,
      });
      await waitForDownload(token);
      return "success";
    },
    ...props,
    onSuccess: (result, variables, onMutateResult, context) => {
      invalidateQueriesFor({ kind: "mod", modsDirectory: variables.modsDirectory }, queryClient);
      props?.onSuccess?.(result, variables, onMutateResult, context);
    },
  });
};
