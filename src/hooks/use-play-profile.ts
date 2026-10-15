import { useMutation, type UseMutationOptions } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";

import { useTauriRunEvents } from "@/hooks/use-tauri-run-events";
import { t } from "@/lib/i18n";
import { toast } from "@/lib/notify";
import { useAccountStore } from "@/stores/accounts";
import { useProfiles } from "@/stores/profiles";
import { useSettingsStore } from "@/stores/settings";

export const usePlayProfile = (
  props?: UseMutationOptions<void, Error, { id: number; save?: string }>,
) => {
  const { subscribe, release } = useTauriRunEvents();
  const { profiles, updateLastPlayed, updatePlaytime } = useProfiles();
  // launch/game-quit events update the profile store; no query cache
  // react-doctor-disable-next-line query-mutation-missing-invalidation
  return useMutation({
    ...props,
    mutationFn: async ({ id, save }) => {
      const { useSystemDotnet } = useSettingsStore.getState();
      await invoke("play_game", {
        options: { profile_id: id, save, use_system_dotnet: useSystemDotnet },
      });
      // The launch can adopt an account from the default profile; refresh the
      // menu so it shows up right away.
      void useAccountStore.getState().loadAccounts();
    },
    onError: (error) => {
      toast.error(t("layout.launch.errorPlaying", { message: error.message }));
    },
    onMutate: async (variable) => {
      // Drop listeners from the previous play so repeated plays don't stack
      // duplicate toasts and playtime updates.
      release();

      const profile = profiles.find((inst) => inst.id === variable.id);

      // Listen for dotnet download progress
      await subscribe<{ phase: string; percent: number }>(
        `dotnet-download-${variable.id}`,
        ({ phase, percent }) => {
          if (phase === "downloading") {
            toast.loading(t("layout.launch.downloadingDotnet", { percent: percent.toFixed(0) }), {
              id: `dotnet-download-${variable.id}`,
            });
          } else if (phase === "extracting") {
            toast.loading(t("layout.launch.extractingDotnet"), {
              id: `dotnet-download-${variable.id}`,
            });
          } else if (phase === "done") {
            toast.dismiss(`dotnet-download-${variable.id}`);
          }
        },
      );

      // Listen for game quit to track playtime
      await subscribe<{
        profileId: number;
        elapsedSeconds: number;
        lastPlayed: number;
        totalTimePlayed: number;
      }>(`game-quit-${variable.id}`, (payload) => {
        updatePlaytime(variable.id, payload.totalTimePlayed, payload.lastPlayed);
      });

      // Backups run before the launch: surface their progress in the same toast.
      await subscribe<{
        phase: string;
        current?: number;
        total?: number;
        message?: string;
      }>(`backup-${variable.id}`, (payload) => {
        const { phase, current, total } = payload;
        if (phase === "backing-up") {
          const percent = total && total > 0 ? Math.round(((current ?? 0) / total) * 100) : 0;
          toast.loading(t("layout.launch.backingUp", { name: profile?.name ?? "", percent }), {
            id: `launch-game-${variable.id}`,
          });
        }
        if (phase === "error") {
          toast.error(t("layout.launch.backupFailed"), {
            description: payload.message,
            id: `backup-error-${variable.id}`,
          });
        }
      });

      await subscribe<{
        status: string;
        reason?: string;
        version?: string;
        line?: string;
      }>(`launch-${variable.id}`, (payload) => {
        const { status } = payload;
        if (status === "session-invalid") {
          toast.warning(t("auth.menu.sessionExpired"), {
            id: `session-expired-${variable.id}`,
            duration: 8000,
          });
        }
        if (status === "pending") {
          toast.loading(t("layout.launch.launching", { name: profile?.name ?? "" }), {
            id: `launch-game-${variable.id}`,
          });
        }
        if (status === "success") {
          toast.success(
            variable.save
              ? t("layout.launch.launchedWithWorld", {
                  world: variable.save,
                  name: profile?.name ?? "",
                })
              : t("layout.launch.launched", { name: profile?.name ?? "" }),
            {
              description: payload.version ? `Version: ${payload.version}` : undefined,
              id: `launch-game-${variable.id}`,
            },
          );
          updateLastPlayed(variable.id);
        }
        if (status === "error") {
          toast.error(t("layout.launch.errorLaunching", { reason: payload.reason }), {
            id: `launch-game-${variable.id}`,
          });
        }
      });
    },
  });
};
