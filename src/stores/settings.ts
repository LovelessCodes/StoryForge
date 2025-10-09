import { createTauriStore } from "@tauri-store/zustand";
import { create } from "zustand";

type SettingsStore = {
	darkMode: boolean;
	toggleDarkMode: () => void;
	installationsParent: string | undefined;
	setInstallationsParent: (path: string | undefined) => void;
	versionsParent: string | undefined;
	setVersionsParent: (path: string | undefined) => void;
	streamMode: boolean;
	toggleStreamMode: () => void;
};

export const useSettingsStore = create<SettingsStore>()((set) => ({
	darkMode: window.matchMedia?.("(prefers-color-scheme: dark)").matches,
	installationsParent: undefined,
	setInstallationsParent: (path) => set(() => ({ installationsParent: path })),
	setVersionsParent: (path) => set(() => ({ versionsParent: path })),
	streamMode: false,
	toggleDarkMode: () => set((state) => ({ darkMode: !state.darkMode })),
	toggleStreamMode: () => set((state) => ({ streamMode: !state.streamMode })),
	versionsParent: undefined,
}));

export const tauriSettingsHandler = createTauriStore(
	"settings",
	useSettingsStore,
	{
		saveOnChange: true,
	},
);
