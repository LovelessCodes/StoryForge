import { type UseMutationOptions, useMutation } from "@tanstack/react-query";

import { hashPath, pathDelimiter } from "@/lib/helpers";

import { useDownloadManager, waitForDownload } from "./use-download-manager";
import type { ModUpdate } from "./use-mod-updates";

/**
 * Queues a mod update into the downloads manager (progress and pause/cancel
 * live in the Downloads sheet) and resolves once it finishes.
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
      const token = `mod:${mod.modidstr}:${mod.modversion}:${hashPath(modsDirectory)}`;
      startModDownload({
        token,
        label: label ?? `${mod.filename.replace(/\.zip$/i, "")} v${mod.modversion}`,
        detail: destinationLabel ?? null,
        url: mod.mainfile,
        destpath: `${modsDirectory}${pathDelimiter}Mods`,
        modsDirectory,
      });
      await waitForDownload(token);
      return "success";
    },
    ...props,
  });
};
