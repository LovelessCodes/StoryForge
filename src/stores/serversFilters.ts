import { create } from "zustand";

export type ServersFilters = {
	selectedGameVersions: string[];
	addGameVersion: (version: string) => void;
	removeGameVersion: (version: string) => void;
	removeAllGameVersions: () => void;
	searchText: string;
	setSearchText: (text: ServersFilters["searchText"]) => void;
	sortBy: "mods" | "name" | "players" | "version" | "whitelist" | "maxplayers";
	setSortBy: (key: ServersFilters["sortBy"]) => void;
	orderDirection: "ascending" | "descending";
	setOrderDirection: (direction: ServersFilters["orderDirection"]) => void;
};

export const useServersFilters = create<ServersFilters>()((set) => ({
	addGameVersion: (version) =>
		set((state) => ({
			selectedGameVersions: [...state.selectedGameVersions, version],
		})),
	orderDirection: "ascending",
	removeAllGameVersions: () => set({ selectedGameVersions: [] }),
	removeGameVersion: (version) =>
		set((state) => ({
			selectedGameVersions: state.selectedGameVersions.filter(
				(v) => v !== version,
			),
		})),
	searchText: "",
	selectedGameVersions: [],
	setOrderDirection: (direction) => set({ orderDirection: direction }),
	setSearchText: (text) => set({ searchText: text }),
	setSortBy: (key) => set({ sortBy: key }),
	sortBy: "players",
}));
