import { useQuery, keepPreviousData } from "@tanstack/react-query";

import { authClient } from "@/lib/auth";

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

export type ModpackList = {
  totalCount: number;
  modpacks: ModpackItem[];
};

export type ModpackArgs = {
  offset?: number;
  limit?: number;
  search?: string;
  sortBy?: string;
  order?: "asc" | "desc";
  owner?: string;
};

/**
 * Query hook for the modpacks list endpoint.
 *
 * The `select` unwraps Better Auth's `{ data, error }` wrapper — the inner
 * shape is `{ totalCount, modpacks }` which matches ModpackList.
 */
export const useModpacks = (args?: ModpackArgs) => {
  return useQuery({
    queryFn: async () => {
      const result = await authClient.getModpacks(args);
      return result;
    },
    placeholderData: keepPreviousData,
    staleTime: Infinity,
    queryKey: ["modpacks", JSON.stringify(args)],
    select: (result: unknown) => {
      const wrapped = result as { data?: ModpackList; error?: unknown };
      return wrapped.data ?? { modpacks: [] as ModpackItem[], totalCount: 0 };
    },
  });
};
