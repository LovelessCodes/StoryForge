import { type UseMutationOptions, useMutation } from "@tanstack/react-query";

import { hashPath, pathDelimiter } from "@/lib/helpers";
import type { ModInfo } from "@/lib/types";

import { useDownloadManager, waitForDownload } from "./use-download-manager";

/**
 * Queues a mod install into the downloads manager (progress and pause/cancel
 * live in the Downloads sheet) and resolves once it finishes.
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
      });
      await waitForDownload(token);
      return "success";
    },
    ...props,
  });
};
