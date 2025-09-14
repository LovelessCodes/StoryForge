import { create } from "zustand";
import type { ModTag } from "@/routes/mods";

export type ModsFilters = {
	selectedGameVersions: string[];
	addGameVersion: (version: string) => void;
	removeGameVersion: (version: string) => void;
	removeAllGameVersions: () => void;
	selectedModTags: ModTag[];
	addModTag: (tag: ModTag) => void;
	removeModTag: (tag: ModTag) => void;
	removeAllModTags: () => void;
	searchText: string;
	setSearchText: (text: ModsFilters["searchText"]) => void;
	sortBy:
		| "created"
		| "name"
		| "trending"
		| "downloads"
		| "follows"
		| "comments"
		| "updated";
	setSortBy: (key: ModsFilters["sortBy"]) => void;
	orderDirection: "ascending" | "descending";
	setOrderDirection: (direction: ModsFilters["orderDirection"]) => void;
	author: string;
	setAuthor: (author: ModsFilters["author"]) => void;
	side: "client" | "server" | "both" | "installed";
	setSide: (side: ModsFilters["side"]) => void;
	category: "mod" | "externaltool" | "other";
	setCategory: (category: ModsFilters["category"]) => void;
};

export const useModsFilters = create<ModsFilters>()((set) => ({
	addGameVersion: (version) =>
		set((state) => ({
			selectedGameVersions: [...state.selectedGameVersions, version],
		})),
	addModTag: (tag) =>
		set((state) => ({
			selectedModTags: [...state.selectedModTags, tag],
		})),
	author: "",
	category: "mod",
	installedOnly: false,
	orderDirection: "ascending",
	removeAllGameVersions: () => set({ selectedGameVersions: [] }),
	removeAllModTags: () => set({ selectedModTags: [] }),
	removeGameVersion: (version) =>
		set((state) => ({
			selectedGameVersions: state.selectedGameVersions.filter(
				(v) => v !== version,
			),
		})),
	removeModTag: (tag) =>
		set((state) => ({
			selectedModTags: state.selectedModTags.filter((t) => t !== tag),
		})),
	searchText: "",
	selectedGameVersions: [],
	selectedModTags: [],
	setAuthor: (author) => set({ author }),
	setCategory: (category) => set({ category }),
	setOrderDirection: (direction) => set({ orderDirection: direction }),
	setSearchText: (text) => set({ searchText: text }),
	setSide: (side) => set({ side }),
	setSortBy: (key) => set({ sortBy: key }),
	side: "both",
	sortBy: "trending",
}));
