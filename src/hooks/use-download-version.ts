import { type UseMutationOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { emit, listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useRef } from "react";
import { toast } from "sonner";

import type { ProgressPayload } from "@/lib/types";
import { buildVersionPath, zipfolderprefix } from "@/lib/utils";
import { useSettingsStore } from "@/stores/settings";

import { useAppFolder } from "./use-app-folder";
import { installedVersionsQueryKey } from "./use-installed-versions";

export const useDownloadVersion = (props?: UseMutationOptions<string, Error, string>) => {
  const { appFolder } = useAppFolder();
  const { versionsParent, versionsSubdir } = useSettingsStore();
  const queryClient = useQueryClient();
  const listenRef = useRef<UnlistenFn>(null);
  return useMutation({
    mutationFn: async (version: string) => {
      const url = (await invoke("get_download_link", {
        version,
      })) as string;
      if (!url) {
        throw new Error("Download URL not found in response");
      }
      const downloadUrl = url;
      if (!appFolder) {
        throw new Error("App folder not found");
      }
      const versionPath = buildVersionPath(versionsParent ?? appFolder, version, versionsSubdir);
      return invoke("download_and_maybe_extract", {
        destpath: versionPath,
        emitevent: `download://version:${version.replace(/\./g, "_")}`,
        extract: true,
        extractdir: versionPath,
        url: downloadUrl,
        zipsubfolderprefix: zipfolderprefix(),
      }) as Promise<string>;
    },
    mutationKey: ["download-version"],
    onError: (error, v) => {
      toast.error(`Error downloading game version: ${error.message}`, {
        action: undefined,
        id: `download-game-version-${v}`,
      });
      listenRef.current?.();
    },
    onMutate: async (v) => {
      toast.loading(`Starting to download game version ${v}...`, {
        action: {
          label: "Cancel",
          onClick: () => emit(`download://version:${v.replace(/\./g, "_")}:cancel`),
        },
        id: `download-game-version-${v}`,
      });
      listenRef.current = await listen<ProgressPayload>(
        `download://version:${v.replace(/\./g, "_")}`,
        (event) => {
          const { phase, percent } = event.payload;
          if (phase === "download") {
            toast.loading(`Downloading game version ${v}: ${percent?.toFixed(0)}%`, {
              action: {
                label: "Cancel",
                onClick: () => emit(`download://version:${v.replace(/\./g, "_")}:cancel`),
              },
              id: `download-game-version-${v}`,
            });
          } else if (phase === "extract") {
            toast.loading(`Extracting game version ${v}...`, {
              action: {
                label: "Cancel",
                onClick: () => emit(`download://version:${v.replace(/\./g, "_")}:cancel`),
              },
              id: `download-game-version-${v}`,
            });
          }
        },
      );
    },
    onSuccess: async (d, v) => {
      listenRef.current?.();
      if (d === "already_downloaded") {
        toast.dismiss(`download-game-version-${v}`);
        return;
      }
      if (d === "cancelled") {
        toast.info(`Download of game version ${v} cancelled`, {
          action: undefined,
          id: `download-game-version-${v}-cancelled`,
        });
        return;
      }
      void queryClient.invalidateQueries({
        queryKey: installedVersionsQueryKey(),
      });
      if (d === "success") {
        toast.success(`Game version ${v} downloaded`, {
          action: undefined,
          id: `download-game-version-${v}`,
        });
      }
    },
    scope: {
      id: "download-version",
    },
    ...props,
  });
};
