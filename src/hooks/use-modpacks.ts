import { authClient } from "@/lib/auth";
import { stripped } from "@/lib/utils";
import { useModpacksFilters } from "@/stores/modpacksFilters";

export type ModpackItem = {
  id: string;
  name: string;
  slug: string;
  description: string;
  imageUrl: string;
  downloads: number;
  owner: {
    id: string;
    name: string;
    image: string | null;
  };
  modpackVersions: Version[];
  createdAt: number;
  updatedAt: number;
};

type Version = {
  id: string;
  version: string;
  gameVersion: string;
  modConfigsUrl: string;
  modsString: string;
  downloads: number;
  modpack: string;
  createdAt: number;
  updatedAt: number;
};

export type ModpackList = ModpackItem[];

/**
 * Query hook for the modpacks list endpoint.
 *
 * The `select` unwraps Better Auth's `{ data, error }` wrapper — the inner
 * shape is `{ totalCount, modpacks }` which matches ModpackList.
 */
export const useModpacks = () => {
  const { data, isPending, error } = authClient.useModpacks();
  const filters = useModpacksFilters();

  const modpacks =
    data?.modpacks
      ?.filter((modpack) => {
        if (filters.searchText.length) {
          return (
            stripped(modpack.name)
              .toLowerCase()
              .includes(stripped(filters.searchText).toLowerCase()) ||
            stripped(modpack.description)
              .toLowerCase()
              .includes(stripped(filters.searchText).toLowerCase())
          );
        }
        if (filters.owner.length) {
          return stripped(modpack.owner.name)
            .toLowerCase()
            .includes(stripped(filters.owner).toLowerCase());
        }
        return true;
      })
      .sort((a, b) => {
        if (filters.sortBy === "name") {
          if (filters.orderDirection === "desc") {
            return stripped(b.name).localeCompare(stripped(a.name));
          }
          return stripped(a.name).localeCompare(stripped(b.name));
        }
        if (filters.sortBy === "created") {
          if (filters.orderDirection === "desc") {
            return b.createdAt - a.createdAt;
          }
          return a.createdAt - b.createdAt;
        }
        if (filters.sortBy === "updated") {
          if (filters.orderDirection === "desc") {
            return b.updatedAt - a.updatedAt;
          }
          return a.updatedAt - b.updatedAt;
        }
        if (filters.sortBy === "downloads") {
          if (filters.orderDirection === "desc") {
            return b.downloads - a.downloads;
          }
          return a.downloads - b.downloads;
        }
        return 0;
      }) ?? [];

  return {
    data: data ? { ...data, modpacks } : undefined,
    isPending,
    error,
  };
};
