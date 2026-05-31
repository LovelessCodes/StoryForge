import { invoke } from "@tauri-apps/api/core";
import { appDataDir } from "@tauri-apps/api/path";
import { createTauriStore } from "@tauri-store/zustand";
import { create } from "zustand";

import { logToFile } from "@/lib/logger";

export type SetParentConfigProps = {
  deleteCurrentData: boolean;
  moveCurrentData: boolean;
};

type SettingsStore = {
  darkMode: boolean;
  toggleDarkMode: () => void;
  installationsParent: string | null;
  installationsSubdir: string;
  setInstallationsParent: (path: string | null, config?: SetParentConfigProps) => Promise<void>;
  versionsParent: string | null;
  versionsSubdir: string;
  setVersionsParent: (path: string | null, config?: SetParentConfigProps) => Promise<void>;
  streamMode: boolean;
  toggleStreamMode: () => void;
};

export const useSettingsStore = create<SettingsStore>()((set, _get, store) => ({
  darkMode: window.matchMedia?.("(prefers-color-scheme: dark)").matches,
  installationsParent: null,
  installationsSubdir: "installations",
  setInstallationsParent: async (path, config) => {
    const appFolder = await appDataDir();
    const { installationsParent, installationsSubdir } = store.getState();
    const dest = path ?? appFolder;
    const src = installationsParent ?? appFolder;
    if (config?.moveCurrentData) {
      logToFile(
        "INFO ",
        `[settings] move_installations: ${src}/${installationsSubdir} -> ${dest}/${installationsSubdir}`,
      );
      await invoke("move_installations_folder", {
        destination: dest,
        source: src,
        subdir: installationsSubdir,
      });
    } else if (config?.deleteCurrentData) {
      logToFile("INFO ", `[settings] remove_all_installations: ${src}/${installationsSubdir}`);
      await invoke("remove_all_installations", {
        source: src,
        subdir: installationsSubdir,
      });
    } else {
      logToFile("INFO ", `[settings] set_installations_parent: ${dest}`);
    }
    set(() => ({ installationsParent: path }));
  },
  setVersionsParent: async (path, config) => {
    const appFolder = await appDataDir();
    const { versionsParent, versionsSubdir } = store.getState();
    const dest = path ?? appFolder;
    const src = versionsParent ?? appFolder;
    if (config?.moveCurrentData) {
      logToFile(
        "INFO ",
        `[settings] move_versions: ${src}/${versionsSubdir} -> ${dest}/${versionsSubdir}`,
      );
      await invoke("move_versions_folder", {
        destination: dest,
        source: src,
        subdir: versionsSubdir,
      });
    } else if (config?.deleteCurrentData) {
      logToFile("INFO ", `[settings] remove_all_versions: ${src}/${versionsSubdir}`);
      await invoke("remove_all_versions", {
        source: src,
        subdir: versionsSubdir,
      });
    } else {
      logToFile("INFO ", `[settings] set_versions_parent: ${dest}`);
    }
    set(() => ({ versionsParent: path }));
  },
  streamMode: false,
  toggleDarkMode: () =>
    set((state) => {
      if (state.darkMode) {
        document.body.classList.remove("dark");
      } else {
        document.body.classList.add("dark");
      }
      return { darkMode: !state.darkMode };
    }),
  toggleStreamMode: () => set((state) => ({ streamMode: !state.streamMode })),
  versionsParent: null,
  versionsSubdir: "versions",
}));

export const tauriSettingsHandler = createTauriStore("settings", useSettingsStore, {
  saveOnChange: true,
});
