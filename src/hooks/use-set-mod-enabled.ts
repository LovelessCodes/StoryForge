import { useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";

import { t } from "@/lib/i18n";
import { toast } from "@/lib/notify";

import { installedModsQueryKey } from "./use-installed-mods";

/**
 * Enables or disables one installed mod by editing the profile's
 * `clientsettings.json` (`stringListSettings.disabledMods`). The mod stays on
 * disk; the game just skips it, exactly like the in-game mod manager.
 */
export const useSetModEnabled = (modsDirectory: string | undefined) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (variables: { modid: string; version: string; enabled: boolean; name: string }) =>
      invoke<string[]>("set_mod_enabled", {
        params: {
          path: modsDirectory,
          modid: variables.modid,
          version: variables.version,
          enabled: variables.enabled,
        },
      }),
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({
        queryKey: installedModsQueryKey(modsDirectory ?? ""),
      });
      toast.success(
        variables.enabled
          ? t("mods.toggle.enabled", { name: variables.name })
          : t("mods.toggle.disabled", { name: variables.name }),
      );
    },
    onError: (error) => {
      toast.error(t("mods.toggle.failed"), { description: String(error) });
    },
  });
};

/** Enables or disables every installed mod of a profile in one write. */
export const useSetAllModsEnabled = (modsDirectory: string | undefined) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (enabled: boolean) =>
      invoke<string[]>("set_all_mods_enabled", { path: modsDirectory, enabled }),
    onSuccess: (_, enabled) => {
      void queryClient.invalidateQueries({
        queryKey: installedModsQueryKey(modsDirectory ?? ""),
      });
      toast.success(enabled ? t("mods.toggle.bulkEnabled") : t("mods.toggle.bulkDisabled"));
    },
    onError: (error) => {
      toast.error(t("mods.toggle.failed"), { description: String(error) });
    },
  });
};

/**
 * Applies a whole enabled/disabled configuration in one write: every installed
 * mod named in `disabled` is turned off, everything else on. Used by presets.
 */
export const useApplyModState = (modsDirectory: string | undefined) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (disabled: string[]) =>
      invoke<string[]>("apply_mod_state", { params: { path: modsDirectory, disabled } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: installedModsQueryKey(modsDirectory ?? ""),
      });
    },
    onError: (error) => {
      toast.error(t("mods.toggle.failed"), { description: String(error) });
    },
  });
};
