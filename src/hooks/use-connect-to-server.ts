import { type UseMutationOptions, useMutation } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";

import { useTauriRunEvents } from "@/hooks/use-tauri-run-events";
import { t } from "@/lib/i18n";
import { toast } from "@/lib/notify";
import { useAccountStore } from "@/stores/accounts";
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
      /** The game's connect address: `ip:port`, or the bare host for its default port. */
      address: string;
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
  const { subscribe, release } = useTauriRunEvents();

  // the flow composes the probe, the server store and play_game; no query cache
  // react-doctor-disable-next-line query-mutation-missing-invalidation
  return useMutation({
    ...props,
    mutationFn: async ({ name, address, password, profileId, pub }) => {
      const resolvedProfile = findProfileForServer(profiles, profileId);
      const resolvedId = resolvedProfile?.id ?? profileId;
      if (!pub) {
        await mutateAsync({
          profileId: resolvedId,
          server: `${name},${address},${password ? password : ""}`,
        });
      }
      const { useSystemDotnet } = useSettingsStore.getState();
      await invoke("play_game", {
        options: {
          profile_id: resolvedId,
          password,
          server: address,
          use_system_dotnet: useSystemDotnet,
        },
      });
      // The launch can adopt an account from the default profile; refresh the
      // menu so it shows up right away.
      void useAccountStore.getState().loadAccounts();
    },
    onError: (error) => {
      // play_game failed: no launch event will arrive, so drop the listeners.
      release();
      toast.error(t("layout.launch.errorConnecting", { message: error.message }));
    },
    onMutate: async (variable) => {
      release();

      const profile = findProfileForServer(profiles, variable.profileId);

      // Listen for dotnet download progress
      const stopDotnet = await subscribe<{ phase: string; percent: number }>(
        `dotnet-download-${variable.profileId}`,
        (payload) => {
          const { phase, percent } = payload;
          if (phase === "downloading") {
            toast.loading(t("layout.launch.downloadingDotnet", { percent: percent.toFixed(0) }), {
              id: `dotnet-download-${variable.profileId}`,
            });
          } else if (phase === "extracting") {
            toast.loading(t("layout.launch.extractingDotnet"), {
              id: `dotnet-download-${variable.profileId}`,
            });
          } else if (phase === "done") {
            toast.dismiss(`dotnet-download-${variable.profileId}`);
          }
        },
      );

      // Backups run before the launch: surface their progress in the same toast.
      await subscribe<{
        phase: string;
        current?: number;
        total?: number;
        message?: string;
      }>(`backup-${variable.profileId}`, (payload) => {
        const { phase, current, total } = payload;
        if (phase === "backing-up") {
          const percent = total && total > 0 ? Math.round(((current ?? 0) / total) * 100) : 0;
          toast.loading(t("layout.launch.backingUp", { name: profile?.name ?? "", percent }), {
            id: `launch-game-${variable.profileId}`,
          });
        }
        if (phase === "error") {
          toast.error(t("layout.launch.backupFailed"), {
            description: payload.message,
            id: `backup-error-${variable.profileId}`,
          });
        }
      });

      const stopLaunch = await subscribe<{
        status: string;
        reason?: string;
        version?: string;
        line?: string;
      }>(`launch-${variable.profileId}`, (payload) => {
        const { status } = payload;
        if (status === "session-invalid") {
          toast.warning(t("auth.menu.sessionExpired"), {
            id: `session-expired-${variable.profileId}`,
            duration: 8000,
          });
        }
        if (status === "pending") {
          toast.loading(t("layout.launch.launching", { name: profile?.name ?? "" }), {
            id: `launch-game-${variable.profileId}`,
          });
        }
        if (status === "success") {
          toast.success(
            t("layout.launch.launchedAndConnecting", {
              name: profile?.name ?? "",
              server: variable.name,
            }),
            {
              description: payload.version ? `Version: ${payload.version}` : undefined,
              id: `launch-game-${variable.profileId}`,
            },
          );
          updateLastPlayed(variable.profileId);
        }
        if (status === "error") {
          toast.error(t("layout.launch.errorLaunching", { reason: payload.reason }), {
            id: `launch-game-${variable.profileId}`,
          });
        }
        if (status === "success" || status === "error") {
          stopDotnet();
          stopLaunch();
        }
      });
    },
  });
};
