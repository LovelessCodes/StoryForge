import { useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";

import { t } from "@/lib/i18n";
import { toast } from "@/lib/notify";

import { installedModsQueryKey } from "./use-installed-mods";

export type ModFileInfo = {
  modid: string;
  version: string;
  name: string;
  filename: string;
};

type InstallError = { name?: string; message?: string };

function installErrorMessage(error: InstallError): string {
  if (error.name === "invalid_mod") return t("mods.installFrom.invalidZip");
  if (error.name === "invalid_url") return t("mods.installFrom.badUrl");
  return error.message ?? String(error.name ?? "");
}

function reportInstalled(info: ModFileInfo) {
  toast.success(t("mods.installFrom.installed", { name: info.name, version: info.version }));
}

/** Installs a local mod zip into a profile's Mods directory. */
export const useInstallModFile = (modsDirectory: string | undefined) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (file: string) =>
      invoke<ModFileInfo>("install_mod_file", { path: modsDirectory, file }),
    onSuccess: (info) => {
      void queryClient.invalidateQueries({
        queryKey: installedModsQueryKey(modsDirectory ?? ""),
      });
      reportInstalled(info);
    },
    onError: (error) => {
      toast.error(t("mods.installFrom.failed"), {
        description: installErrorMessage(error as unknown as InstallError),
      });
    },
  });
};

/** Installs a mod zip from a direct https URL into a profile. */
export const useInstallModUrl = (modsDirectory: string | undefined) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (url: string) =>
      invoke<ModFileInfo>("install_mod_url", { path: modsDirectory, url }),
    onSuccess: (info) => {
      void queryClient.invalidateQueries({
        queryKey: installedModsQueryKey(modsDirectory ?? ""),
      });
      reportInstalled(info);
    },
    onError: (error) => {
      toast.error(t("mods.installFrom.failed"), {
        description: installErrorMessage(error as unknown as InstallError),
      });
    },
  });
};
