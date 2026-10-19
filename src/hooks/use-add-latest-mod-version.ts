import { useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";

import { hashPath, latestRelease } from "@/lib/helpers";
import { t } from "@/lib/i18n";
import type { Mod, ModInfo } from "@/lib/types";

import { invalidateQueriesFor, useDownloadManager, waitForDownload } from "./use-download-manager";

/**
 * Queues the newest release of a mod into the downloads manager (progress and
 * pause/cancel live in the Downloads sheet) and resolves once it finishes.
 *
 * This mutation owns the cache sync for its download: the queue entry asks the
 * manager to skip its own refresh (`refreshOwnedByCaller`), and `onSuccess`
 * refreshes the profile's lists. Standalone downloads carry no profile root,
 * so for them the refresh is a no-op.
 */
export const useAddLatestModVersion = ({
  destinationLabel,
  mod,
  modsDirectory,
}: {
  mod: Mod;
  modsDirectory?: string;
  /** Display name of the destination profile/server for the sheet. */
  destinationLabel?: string;
}) => {
  const { startModDownload } = useDownloadManager();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ path }: { path: string }) => {
      const modInfo = (await invoke("fetch_mod_info", {
        modid: mod.modid.toString(),
      })) as ModInfo;
      const release = latestRelease(modInfo.mod.releases);
      if (!release?.mainfile) {
        throw new Error(`No download available for ${modInfo.mod.name}`);
      }
      const token = `mod:${mod.modid}:${release.modversion}:${hashPath(path)}`;
      startModDownload({
        token,
        label: `${modInfo.mod.name} v${release.modversion}`,
        detail:
          destinationLabel ??
          (modsDirectory
            ? (modsDirectory.split(/[/\\]/).pop() ?? null)
            : t("downloads.standalone")),
        url: release.mainfile,
        destpath: path,
        modsDirectory: modsDirectory ?? null,
        refreshOwnedByCaller: true,
      });
      await waitForDownload(token);
      return { modInfo };
    },
    onSuccess: () => {
      invalidateQueriesFor({ kind: "mod", modsDirectory: modsDirectory ?? null }, queryClient);
    },
  });
};
