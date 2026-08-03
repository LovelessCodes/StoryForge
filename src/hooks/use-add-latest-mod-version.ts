import { useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useRef } from "react";
import { toast } from "sonner";

import type { Mod } from "@/components/lists/mod.list";
import type { ModInfo, ProgressPayload } from "@/lib/types";
import { hashPath, latestRelease, pathDelimiter } from "@/lib/utils";

import { installedModsQueryKey } from "./use-installed-mods";
import { modUpdatesQueryKey } from "./use-mod-updates";

export const useAddLatestModVersion = ({
  mod,
  modsDirectory,
}: {
  mod: Mod;
  modsDirectory?: string;
}) => {
  const pathHash = modsDirectory ? hashPath(modsDirectory) : "standalone";
  const emitevent = `mod-download-${mod.modid}-${pathHash}`;
  const queryClient = useQueryClient();
  const listenRef = useRef<UnlistenFn>(null);

  return useMutation({
    mutationFn: async ({ path }: { path: string }) => {
      const modInfo = (await invoke("fetch_mod_info", {
        modid: mod.modid.toString(),
      })) as ModInfo;
      (await invoke("download_and_maybe_extract", {
        destpath: path,
        emitevent,
        extract: false,
        url: latestRelease(modInfo.mod.releases)?.mainfile,
      })) as string;
      return { modInfo };
    },
    onError: (error, _, result) => {
      const label = modsDirectory
        ? modsDirectory.split(pathDelimiter).pop() || modsDirectory
        : "Mods";
      toast.error(`Error downloading ${result?.modInfo?.mod.name} to ${label}: ${error.message}`, {
        id: `add-mod-${result?.modInfo?.mod.modid}-${pathHash}`,
      });
      listenRef.current?.();
    },
    onMutate: async () => {
      const modInfo = (await invoke("fetch_mod_info", {
        modid: mod.modid.toString(),
      })) as ModInfo;
      const label = modsDirectory
        ? modsDirectory.split(pathDelimiter).pop() || modsDirectory
        : "Mods";
      toast.loading(`Downloading ${modInfo?.mod.name} to ${label}...`, {
        id: `add-mod-${modInfo?.mod.modid}-${pathHash}`,
      });
      listenRef.current = await listen<ProgressPayload>(emitevent, (event) => {
        const { phase, percent } = event.payload;
        if (phase === "download") {
          toast.loading(`Downloading ${modInfo?.mod.name} to ${label}... ${percent?.toFixed(0)}%`, {
            id: `add-mod-${modInfo?.mod.modid}-${pathHash}`,
          });
        }
      });
      return { modInfo };
    },
    onSuccess: async (_, __, { modInfo }) => {
      if (!modsDirectory) return;
      listenRef.current?.();
      const label = modsDirectory.split(pathDelimiter).pop() || modsDirectory;
      toast.success(`Successfully downloaded ${modInfo?.mod.name} to ${label}`, {
        id: `add-mod-${modInfo?.mod.modid}-${pathHash}`,
      });
      void queryClient.invalidateQueries({
        queryKey: modUpdatesQueryKey(modsDirectory),
      });
      void queryClient.invalidateQueries({
        queryKey: installedModsQueryKey(modsDirectory),
      });
    },
  });
};
