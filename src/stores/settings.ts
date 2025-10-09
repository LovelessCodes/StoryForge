import { invoke } from "@tauri-apps/api/core";
import { appDataDir } from "@tauri-apps/api/path";
import { createTauriStore } from "@tauri-store/zustand";
import { create } from "zustand";

type SetParentConfigProps = {
	deleteCurrentData: boolean;
	moveCurrentData: boolean;
};

type SettingsStore = {
	darkMode: boolean;
	toggleDarkMode: () => void;
	installationsParent: string | null;
	setInstallationsParent: (
		path: string | null,
		config?: SetParentConfigProps,
	) => Promise<void>;
	versionsParent: string | null;
	setVersionsParent: (
		path: string | null,
		config?: SetParentConfigProps,
	) => Promise<void>;
	streamMode: boolean;
	toggleStreamMode: () => void;
};

export const useSettingsStore = create<SettingsStore>()((set, _get, store) => ({
	darkMode: window.matchMedia?.("(prefers-color-scheme: dark)").matches,
	installationsParent: null,
	setInstallationsParent: async (path, config) => {
		const appFolder = await appDataDir();
		const installationsParent = store.getState().installationsParent;
		if (config?.moveCurrentData) {
			await invoke("move_installations_folder", {
				destination: path ?? appFolder,
				source: installationsParent ?? appFolder,
			});
		} else if (config?.deleteCurrentData) {
			await invoke("remove_all_installations", {
				source: installationsParent ?? appFolder,
			});
		}
		set(() => ({ installationsParent: path }));
	},
	setVersionsParent: async (path, config) => {
		const appFolder = await appDataDir();
		const versionsParent = store.getState().versionsParent;
		if (config?.moveCurrentData) {
			await invoke("move_versions_folder", {
				destination: path ?? appFolder,
				source: versionsParent ?? appFolder,
			});
		} else if (config?.deleteCurrentData) {
			await invoke("remove_all_versions", {
				source: versionsParent ?? appFolder,
			});
		}
		set(() => ({ versionsParent: path }));
	},
	streamMode: false,
	toggleDarkMode: () => set((state) => ({ darkMode: !state.darkMode })),
	toggleStreamMode: () => set((state) => ({ streamMode: !state.streamMode })),
	versionsParent: null,
}));

export const tauriSettingsHandler = createTauriStore(
	"settings",
	useSettingsStore,
	{
		saveOnChange: true,
	},
);
