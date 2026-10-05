import { type UseMutationOptions, useMutation } from "@tanstack/react-query";

import { t } from "@/lib/i18n";
import { toast } from "@/lib/notify";
import { useDownloadStore } from "@/stores/downloads";

import { useDownloadManager, waitForDownload } from "./use-download-manager";

/**
 * Queues a game version download in the downloads manager — progress lives in
 * the Downloads sheet and the titlebar, not in a toast.
 *
 * The mutation resolves only after the download finishes (and rejects on
 * failure or cancellation), so flows that continue afterwards — importing a
 * profile or modpack once its game version is available — can await it. A
 * download already running for the version is joined instead of restarted.
 */
export const useDownloadVersion = (props?: UseMutationOptions<string, Error, string>) => {
  const { resume, startDownload } = useDownloadManager();
  return useMutation({
    mutationFn: async (version: string) => {
      const entry = useDownloadStore.getState().entries[version];
      // A finished or failed entry from an earlier attempt would make
      // `startDownload` a no-op (and `waitForDownload` resolve instantly), so
      // drop it and start fresh.
      if (entry?.status === "done" || entry?.status === "error") {
        useDownloadStore.getState().removeEntry(version);
      }
      startDownload(version);
      if (entry?.status === "paused") resume(version);
      await waitForDownload(version);
      return "success";
    },
    mutationKey: ["download-version"],
    onError: (error, version) => {
      // Cancelling is deliberate; the sheet already dropped the entry.
      if (error.message === "Download cancelled") return;
      toast.error(t("versions.toast.downloadFailed", { version }), {
        description: error.message,
        id: `download-game-version-${version}`,
      });
    },
    scope: {
      id: "download-version",
    },
    ...props,
  });
};
