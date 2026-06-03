import type { UseMutationOptions } from "@tanstack/react-query";
import { useMutation } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useRef } from "react";
import { toast } from "sonner";

import { useInstallations } from "@/stores/installations";
import { useSettingsStore } from "@/stores/settings";

export const usePlayInstallation = (
  props?: UseMutationOptions<void, Error, { id: number; save?: string }>,
) => {
  const unlistens = useRef<UnlistenFn[]>([]);
  const { installations, updateLastPlayed, updatePlaytime } = useInstallations();
  return useMutation({
    ...props,
    mutationFn: ({ id, save }) => {
      const { useSystemDotnet } = useSettingsStore.getState();
      return invoke("play_game", {
        options: { installation_id: id, save, use_system_dotnet: useSystemDotnet },
      });
    },
    onError: (error) => {
      toast.error(`Error playing with installation: ${error.message}`);
    },
    onMutate: async (variable) => {
      const installation = installations.find((inst) => inst.id === variable.id);

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
        installationId: number;
        elapsedSeconds: number;
        lastPlayed: number;
        totalTimePlayed: number;
      }>(`game-quit-${variable.id}`, (event) => {
        updatePlaytime(variable.id, event.payload.totalTimePlayed, event.payload.lastPlayed);
      });
      unlistens.current.push(unlistenQuit);

      const unlistenLaunch = await listen<{
        status: string;
        reason?: string;
        version?: string;
        line?: string;
      }>(`launch-${variable.id}`, (event) => {
        const { status } = event.payload;
        if (status === "pending") {
          toast.loading(`Launching ${installation?.name}...`, {
            id: `launch-game-${variable.id}`,
          });
        }
        if (status === "success") {
          toast.success(
            `Launched${variable.save ? ` world ${variable.save} with` : ""} ${installation?.name}!`,
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
