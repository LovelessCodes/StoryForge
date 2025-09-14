import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { createTauriStore } from "@tauri-store/zustand";
import { useEffect } from "react";
import { toast } from "sonner";
import { create } from "zustand";

type SettingStore = {
	execPath: string | null;
	setExecPath: (path: SettingStore["execPath"]) => Promise<boolean>;
};

export const useSettingStore = create<SettingStore>((set) => ({
	execPath: "",
	setExecPath: async (path) => {
		try {
			const result = await invoke("confirm_vintage_story_exe", { path });
			if (result) {
				toast.success("Game executable path saved!");
				set({ execPath: path });
				return true;
			}
		} catch {
			toast.error(
				"Could not find a valid Vintage Story executable at that path.",
			);
		}
		return false;
	},
}));

export const tauriSettingsHandler = createTauriStore(
	"settings",
	useSettingStore,
	{
		saveOnChange: true,
	},
);

export const useSettings = () => {
	const execPath = useSettingStore((state) => state.execPath);
	const setExecPath = useSettingStore((state) => state.setExecPath);
	const { data, isFetching, isError, error } = useQuery({
		enabled: execPath === null,
		queryFn: () => invoke("detect_vintage_story_exe"),
		queryKey: ["exec-path"],
		staleTime: 5 * 60 * 1000,
	});

	useEffect(() => {
		if (execPath == null && data) {
			setExecPath(data as string);
		}
	}, [execPath, data, setExecPath]);

	return { error, execPath, isError, isFetching, setExecPath };
};
