import { type UseMutationOptions, useMutation } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useRef } from "react";
import { toast } from "sonner";

import { findInstallationForServer, useInstallations } from "@/stores/installations";
import { useSettingsStore } from "@/stores/settings";

import { useAddServerToInstallation } from "./use-add-server-to-installation";
import { useCheckServerInInstallation } from "./use-check-server-in-installation";

export const useConnectToServer = (
  props?: UseMutationOptions<
    void,
    Error,
    {
      name: string;
      ip: string;
      password: string;
      installationId: number;
      pub?: boolean;
    }
  >,
) => {
  const { installations, updateLastPlayed } = useInstallations();
  const { mutateAsync: addServer } = useAddServerToInstallation({
    onError: (error) => {
      throw error;
    },
  });
  const { mutateAsync } = useCheckServerInInstallation({
    onSuccess: async (data, variables) => {
      if (data === false) {
        await addServer({
          installationId: variables.installationId,
          server: variables.server,
        });
      }
    },
  });
  const unlistens = useRef<UnlistenFn[]>([]);
  return useMutation({
    ...props,
    mutationFn: async ({ name, ip, password, installationId, pub }) => {
      const resolvedInstallation = findInstallationForServer(installations, installationId);
      const resolvedId = resolvedInstallation?.id ?? installationId;
      if (!pub) {
        await mutateAsync({
          installationId: resolvedId,
          server: `${name},${ip},${password ? password : ""}`,
        });
      }
      const { useSystemDotnet } = useSettingsStore.getState();
      await invoke("play_game", {
        options: {
          installation_id: resolvedId,
          password,
          server: ip,
          use_system_dotnet: useSystemDotnet,
        },
      });
    },
    onError: (error) => {
      toast.error(`Error connecting to server: ${error.message}`);
    },
    onMutate: async (variable) => {
      for (const unlisten of unlistens.current) {
        unlisten();
      }
      unlistens.current = [];

      const installation = findInstallationForServer(installations, variable.installationId);

      // Listen for dotnet download progress
      const unlistenDotnet = await listen<{ phase: string; percent: number }>(
        `dotnet-download-${variable.installationId}`,
        (event) => {
          const { phase, percent } = event.payload;
          if (phase === "downloading") {
            toast.loading(`Downloading .NET runtime... ${percent.toFixed(0)}%`, {
              id: `dotnet-download-${variable.installationId}`,
            });
          } else if (phase === "extracting") {
            toast.loading("Extracting .NET runtime...", {
              id: `dotnet-download-${variable.installationId}`,
            });
          } else if (phase === "done") {
            toast.dismiss(`dotnet-download-${variable.installationId}`);
          }
        },
      );
      unlistens.current.push(unlistenDotnet);

      const unlistenLaunch = await listen<{
        status: string;
        reason?: string;
        version?: string;
        line?: string;
      }>(`launch-${variable.installationId}`, (event) => {
        const { status } = event.payload;
        if (status === "pending") {
          toast.loading(`Launching ${installation?.name}...`, {
            id: `launch-game-${variable.installationId}`,
          });
        }
        if (status === "success") {
          toast.success(`Launched ${installation?.name} and connecting to ${variable.name}!`, {
            description: event.payload.version ? `Version: ${event.payload.version}` : undefined,
            id: `launch-game-${variable.installationId}`,
          });
          updateLastPlayed(variable.installationId);
        }
        if (status === "error") {
          toast.error(`Error launching game: ${event.payload.reason}`, {
            id: `launch-game-${variable.installationId}`,
          });
        }
        if (status === "success" || status === "error") {
          unlistenDotnet();
          unlistenLaunch();
          unlistens.current = unlistens.current.filter(
            (fn) => fn !== unlistenDotnet && fn !== unlistenLaunch,
          );
        }
      });
      unlistens.current.push(unlistenLaunch);
    },
  });
};
