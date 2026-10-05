import type { UseMutationOptions } from "@tanstack/react-query";
import { useMutation } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useEffect, useRef } from "react";

import { toast } from "@/lib/notify";
import { useProfiles } from "@/stores/profiles";
import { useSettingsStore } from "@/stores/settings";

export const usePlayProfile = (
  props?: UseMutationOptions<void, Error, { id: number; save?: string }>,
) => {
  const unlistens = useRef<UnlistenFn[]>([]);
  const { profiles, updateLastPlayed, updatePlaytime } = useProfiles();

  // Detach on unmount; otherwise every play leaks three listeners for the
  // lifetime of the app.
  useEffect(
    () => () => {
      for (const unlisten of unlistens.current) unlisten();
      unlistens.current = [];
    },
    [],
  );
  // launch/game-quit events update the profile store; no query cache
  // react-doctor-disable-next-line query-mutation-missing-invalidation
  return useMutation({
    ...props,
    mutationFn: ({ id, save }) => {
      const { useSystemDotnet } = useSettingsStore.getState();
      return invoke("play_game", {
        options: { profile_id: id, save, use_system_dotnet: useSystemDotnet },
      });
    },
    onError: (error) => {
      toast.error(`Error playing with profile: ${error.message}`);
    },
    onMutate: async (variable) => {
      // Drop listeners from the previous play so repeated plays don't stack
      // duplicate toasts and playtime updates.
      for (const unlisten of unlistens.current) unlisten();
      unlistens.current = [];

      const profile = profiles.find((inst) => inst.id === variable.id);

      // Listen for dotnet download progress
      const unlistenDotnet = await listen<{ phase: string; percent: number }>(
        `dotnet-download-${variable.id}`,
        (event) => {
          const { phase, percent } = event.payload;
          if (phase === "downloading") {
            toast.loading(`Downloading .NET runtime... ${percent.toFixed(0)}%`, {
              id: `dotnet-download-${variable.id}`,
            });
          } else if (phase === "extracting") {
            toast.loading("Extracting .NET runtime...", {
              id: `dotnet-download-${variable.id}`,
            });
          } else if (phase === "done") {
            toast.dismiss(`dotnet-download-${variable.id}`);
          }
        },
      );

      unlistens.current.push(unlistenDotnet);

      // Listen for game quit to track playtime
      const unlistenQuit = await listen<{
        profileId: number;
        elapsedSeconds: number;
        lastPlayed: number;
        totalTimePlayed: number;
      }>(`game-quit-${variable.id}`, (event) => {
        updatePlaytime(variable.id, event.payload.totalTimePlayed, event.payload.lastPlayed);
      });
      unlistens.current.push(unlistenQuit);

      // Backups run before the launch: surface their progress in the same toast.
      const unlistenBackup = await listen<{
        phase: string;
        current?: number;
        total?: number;
        message?: string;
      }>(`backup-${variable.id}`, (event) => {
        const { phase, current, total } = event.payload;
        if (phase === "backing-up") {
          const percent = total && total > 0 ? Math.round(((current ?? 0) / total) * 100) : 0;
          toast.loading(`Backing up ${profile?.name}… ${percent}%`, {
            id: `launch-game-${variable.id}`,
          });
        }
        if (phase === "error") {
          toast.error("Backup before launch failed", {
            description: event.payload.message,
            id: `backup-error-${variable.id}`,
          });
        }
      });
      unlistens.current.push(unlistenBackup);

      const unlistenLaunch = await listen<{
        status: string;
        reason?: string;
        version?: string;
        line?: string;
      }>(`launch-${variable.id}`, (event) => {
        const { status } = event.payload;
        if (status === "pending") {
          toast.loading(`Launching ${profile?.name}...`, {
            id: `launch-game-${variable.id}`,
          });
        }
        if (status === "success") {
          toast.success(
            `Launched${variable.save ? ` world ${variable.save} with` : ""} ${profile?.name}!`,
            {
              description: event.payload.version ? `Version: ${event.payload.version}` : undefined,
              id: `launch-game-${variable.id}`,
            },
          );
          updateLastPlayed(variable.id);
        }
        if (status === "error") {
          toast.error(`Error launching game: ${event.payload.reason}`, {
            id: `launch-game-${variable.id}`,
          });
        }
      });
      unlistens.current.push(unlistenLaunch);
    },
  });
};
