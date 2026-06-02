import { create } from "zustand";

export type ModpacksFilters = {
  searchText: string;
  setSearchText: (text: string) => void;
  sortBy: "name" | "created" | "updated" | "downloads";
  setSortBy: (key: ModpacksFilters["sortBy"]) => void;
  orderDirection: "asc" | "desc";
  setOrderDirection: (direction: ModpacksFilters["orderDirection"]) => void;
  owner: string;
  setOwner: (owner: string) => void;
};

export const useModpacksFilters = create<ModpacksFilters>()((set) => ({
  orderDirection: "desc",
  owner: "",
  searchText: "",
  setOrderDirection: (direction) => set({ orderDirection: direction }),
  setOwner: (owner) => set({ owner }),
  setSearchText: (text) => set({ searchText: text }),
  setSortBy: (key) => set({ sortBy: key }),
  sortBy: "downloads",
}));
