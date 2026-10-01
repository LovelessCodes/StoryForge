import { type UseMutationOptions, useMutation } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useEffect, useRef } from "react";

import { toast } from "@/lib/notify";
import { findProfileForServer, useProfiles } from "@/stores/profiles";
import { useSettingsStore } from "@/stores/settings";

import { useAddServerToProfile } from "./use-add-server-to-profile";
import { useCheckServerInProfile } from "./use-check-server-in-profile";

export const useConnectToServer = (
  props?: UseMutationOptions<
    void,
    Error,
    {
      name: string;
      ip: string;
      password: string;
      profileId: number;
      pub?: boolean;
    }
  >,
) => {
  const { profiles, updateLastPlayed } = useProfiles();
  const { mutateAsync: addServer } = useAddServerToProfile({
    onError: (error) => {
      throw error;
    },
  });
  const { mutateAsync } = useCheckServerInProfile({
    onSuccess: async (data, variables) => {
      if (data === false) {
        await addServer({
          profileId: variables.profileId,
          server: variables.server,
        });
      }
    },
  });
  const unlistens = useRef<UnlistenFn[]>([]);

  // Detach on unmount; launch/dotnet errors previously left them attached.
  useEffect(
    () => () => {
      for (const unlisten of unlistens.current) unlisten();
      unlistens.current = [];
    },
    [],
  );

  // the flow composes the probe, the server store and play_game; no query cache
  // react-doctor-disable-next-line query-mutation-missing-invalidation
  return useMutation({
    ...props,
    mutationFn: async ({ name, ip, password, profileId, pub }) => {
      const resolvedProfile = findProfileForServer(profiles, profileId);
      const resolvedId = resolvedProfile?.id ?? profileId;
      if (!pub) {
        await mutateAsync({
          profileId: resolvedId,
          server: `${name},${ip},${password ? password : ""}`,
        });
      }
      const { useSystemDotnet } = useSettingsStore.getState();
      await invoke("play_game", {
        options: {
          profile_id: resolvedId,
          password,
          server: ip,
          use_system_dotnet: useSystemDotnet,
        },
      });
    },
    onError: (error) => {
      // play_game failed: no launch event will arrive, so drop the listeners.
      for (const unlisten of unlistens.current) unlisten();
      unlistens.current = [];
      toast.error(`Error connecting to server: ${error.message}`);
    },
    onMutate: async (variable) => {
      for (const unlisten of unlistens.current) {
        unlisten();
      }
      unlistens.current = [];

      const profile = findProfileForServer(profiles, variable.profileId);

      // Listen for dotnet download progress
      const unlistenDotnet = await listen<{ phase: string; percent: number }>(
        `dotnet-download-${variable.profileId}`,
        (event) => {
          const { phase, percent } = event.payload;
          if (phase === "downloading") {
            toast.loading(`Downloading .NET runtime... ${percent.toFixed(0)}%`, {
              id: `dotnet-download-${variable.profileId}`,
            });
          } else if (phase === "extracting") {
            toast.loading("Extracting .NET runtime...", {
              id: `dotnet-download-${variable.profileId}`,
            });
          } else if (phase === "done") {
            toast.dismiss(`dotnet-download-${variable.profileId}`);
          }
        },
      );
      unlistens.current.push(unlistenDotnet);

      const unlistenLaunch = await listen<{
        status: string;
        reason?: string;
        version?: string;
        line?: string;
      }>(`launch-${variable.profileId}`, (event) => {
        const { status } = event.payload;
        if (status === "pending") {
          toast.loading(`Launching ${profile?.name}...`, {
            id: `launch-game-${variable.profileId}`,
          });
        }
        if (status === "success") {
          toast.success(`Launched ${profile?.name} and connecting to ${variable.name}!`, {
            description: event.payload.version ? `Version: ${event.payload.version}` : undefined,
            id: `launch-game-${variable.profileId}`,
          });
          updateLastPlayed(variable.profileId);
        }
        if (status === "error") {
          toast.error(`Error launching game: ${event.payload.reason}`, {
            id: `launch-game-${variable.profileId}`,
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
