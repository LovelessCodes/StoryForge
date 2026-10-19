import { type UseMutationOptions, useMutation, useQueryClient } from "@tanstack/react-query";

import { hashPath, pathDelimiter } from "@/lib/helpers";

import { invalidateQueriesFor, useDownloadManager, waitForDownload } from "./use-download-manager";
import type { ModUpdate } from "./use-mod-updates";

/**
 * Queues a mod update into the downloads manager (progress and pause/cancel
 * live in the Downloads sheet) and resolves once it finishes.
 *
 * This mutation owns the cache sync for its download: the queue entry asks the
 * manager to skip its own refresh (`refreshOwnedByCaller`), and `onSuccess`
 * refreshes the profile's installed-mods and mod-updates lists.
 */
export const useAddModUpdateToProfile = (
  props?: UseMutationOptions<
    string,
    Error,
    {
      modsDirectory: string;
      mod: ModUpdate;
      destinationLabel?: string;
      /** Display name for the sheet; falls back to the file name. */
      label?: string;
    }
  >,
) => {
  const { startModDownload } = useDownloadManager();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      modsDirectory,
      mod,
      destinationLabel,
      label,
    }: {
      modsDirectory: string;
      mod: ModUpdate;
      destinationLabel?: string;
      label?: string;
    }) => {
      if (!mod.mainfile) {
        throw new Error(`No download available for ${mod.filename}`);
      }
      // The token hashes the directory the file lands in (not the profile
      // root), so two entries targeting the same file share one token.
      const destpath = `${modsDirectory}${pathDelimiter}Mods`;
      const token = `mod:${mod.modidstr}:${mod.modversion}:${hashPath(destpath)}`;
      startModDownload({
        token,
        label: label ?? `${mod.filename.replace(/\.zip$/i, "")} v${mod.modversion}`,
        detail: destinationLabel ?? null,
        url: mod.mainfile,
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
