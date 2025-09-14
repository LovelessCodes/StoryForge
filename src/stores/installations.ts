import { createTauriStore } from "@tauri-store/zustand";
import { toast } from "sonner";
import { create } from "zustand/react";

export type Installation = {
	id: number;
	name: string;
	index: number;
	path: string;
	lastTimePlayed: number;
	totalTimePlayed: number;
	version: string;
	startParams: string;
	icon: string | null;
	favorite: boolean;
};

type InstallationsStore = {
	selectedInstallation: Installation | null;
	setSelectedInstallation: (
		installation: InstallationsStore["selectedInstallation"],
	) => void;
	installations: Installation[];
	addInstallation: (
		installation: Installation,
		cb?: (status: boolean) => void,
	) => void;
	removeInstallation: (id: number) => void;
	updateLastPlayed: (id: number) => void;
	updateInstallation: (
		installation: Installation,
		cb?: (status: boolean) => void,
	) => void;
	moveInstallation: (id: number, newIndex: number) => void;
	toggleFavorite: (id: number) => void;
};

export const useInstallationsStore = create<InstallationsStore>((set) => ({
	addInstallation: (installation, cb) =>
		set((state) => {
			if (state.installations.find((s) => s.path === installation.path)) {
				toast.error(
					`Installation with path "${installation.path}" already exists`,
				);
				cb?.(false);
				return state;
			}
			if (state.installations.find((s) => s.id === installation.id)) {
				toast.error(`Installation with ID "${installation.id}" already exists`);
				cb?.(false);
				return state;
			}
			if (state.installations.find((s) => s.name === installation.name)) {
				toast.error(
					`Installation with name "${installation.name}" already exists`,
				);
				cb?.(false);
				return state;
			}
			if (state.installations.find((s) => s.index === installation.index)) {
				toast.error(
					`Installation with index "${installation.index}" already exists`,
				);
				cb?.(false);
				return state;
			}
			const installations = [...state.installations, installation];
			toast.success(`Installation "${installation.name}" added successfully`);
			cb?.(true);
			return { installations };
		}),
	installations: [],
	moveInstallation: (id, newIndex) =>
		set((state) => {
			const installations = [...state.installations];
			const oldIndex = installations.findIndex((s) => s.id === id);
			if (oldIndex === -1 || newIndex < 0 || newIndex >= installations.length)
				return state;

			const [moved] = installations.splice(oldIndex, 1);
			installations.splice(newIndex, 0, moved);

			// Re-index all installations
			const reindexed = installations.map((installation, idx) => ({
				...installation,
				index: idx,
			}));
			return { ...state, installations: reindexed };
		}),
	removeInstallation: (id) =>
		set((state) => ({
			installations: state.installations.filter((inst) => inst.id !== id),
		})),
	selectedInstallation: null,
	setSelectedInstallation: (installation) =>
		set({ selectedInstallation: installation }),
	toggleFavorite: (id) =>
		set((state) => ({
			installations: state.installations.map((inst) =>
				inst.id === id ? { ...inst, favorite: !inst.favorite } : inst,
			),
		})),
	updateInstallation: (installation, cb) =>
		set((state) => {
			if (state.installations.find((s) => s.path === installation.path)) {
				toast.error(
					`Installation with path "${installation.path}" already exists`,
				);
				cb?.(false);
				return state;
			}
			if (state.installations.find((s) => s.id === installation.id)) {
				toast.error(`Installation with ID "${installation.id}" already exists`);
				cb?.(false);
				return state;
			}
			if (state.installations.find((s) => s.name === installation.name)) {
				toast.error(
					`Installation with name "${installation.name}" already exists`,
				);
				cb?.(false);
				return state;
			}
			if (state.installations.find((s) => s.index === installation.index)) {
				toast.error(
					`Installation with index "${installation.index}" already exists`,
				);
				cb?.(false);
				return state;
			}
			toast.success(`Installation "${installation.name}" updated successfully`);
			cb?.(true);
			return {
				installations: [
					...state.installations.filter((s) => s.id !== installation.id),
					installation,
				],
			};
		}),
	updateLastPlayed: (id) =>
		set((state) => ({
			installations: state.installations.map((inst) =>
				inst.id === id ? { ...inst, lastTimePlayed: Date.now() } : inst,
			),
		})),
}));

export const useInstallations = () => {
	const {
		updateInstallation,
		addInstallation,
		removeInstallation,
		installations,
		moveInstallation,
		selectedInstallation,
		setSelectedInstallation,
		toggleFavorite,
		updateLastPlayed,
	} = useInstallationsStore();

	// const { data: standardInstallation } = useQuery({
	// 	queryFn: () =>
	// 		invoke<{ path: string, version: string | null }>("detect_vintage_story_exe") as Promise<{ path: string; version: string | null }>,
	// 	queryKey: ["standardInstallation"],
	// 	refetchOnWindowFocus: false,
	// });

	const outInstallations = [
		...installations,
		// standardInstallation ? {
		// 	favorite: false,
		// 	icon: null,
		// 	id: 0,
		// 	index: -1,
		// 	lastTimePlayed: 0,
		// 	name: "Standard Installation",
		// 	path: standardInstallation?.path || "Not detected",
		// 	startParams: "",
		// 	totalTimePlayed: 0,
		// 	version: standardInstallation?.version || "N/A",
		// } : null,
	]
		.filter((i) => i !== null)
		.sort((a, b) => a.index - b.index);

	return {
		addInstallation,
		installations: outInstallations,
		moveInstallation,
		removeInstallation,
		selectedInstallation,
		setSelectedInstallation,
		toggleFavorite,
		updateInstallation,
		updateLastPlayed,
	};
};

export const tauriInstallationsHandler = createTauriStore(
	"installations",
	useInstallationsStore,
	{
		saveOnChange: true,
	},
);
