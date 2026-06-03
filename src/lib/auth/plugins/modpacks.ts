import type { BetterFetchOption } from "@better-fetch/fetch";
import { BetterAuthClientPlugin } from "better-auth";
import { useAuthQuery } from "better-auth/client";
import { atom } from "nanostores";

import { ModpackItem } from "@/hooks/use-modpacks";

type Modpacks = {
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
  createdAt: string;
  updatedAt: string;
};

type CreateModpack = {
  name: string;
  slug: string;
  description: string;
  imageUrl?: string;
};

type Version = {
  id: string;
  version: string;
  gameVersion: string;
  modConfigsUrl: string;
  modsString: string;
  downloads: number;
  modpack: string;
  createdAt: string;
  updatedAt: string;
};

type CreateModpackVersion = {
  version: string;
  gameVersion: string;
  modConfigsUrl: string;
  modsString: string;
  modpack: string;
};

export const modpacksPlugin = () =>
  ({
    id: "modpacks-client-plugin",
    getActions: ($fetch) => ({
      getModpacks: async (
        data?: {
          offset?: number;
          limit?: number;
          search?: string;
          sortBy?: string;
          order?: "asc" | "desc";
          owner?: string;
        },
        fetchOptions?: BetterFetchOption,
      ) => {
        const res = await $fetch<{ totalCount: number; modpacks: Modpacks[] }>("/modpacks", {
          query: data,
          ...fetchOptions,
        });
        return res;
      },
      createModpack: async (data: CreateModpack, fetchOptions?: BetterFetchOption) => {
        const res = await $fetch<Modpacks>("/modpacks", {
          method: "POST",
          body: data,
          ...fetchOptions,
        });
        return res;
      },
      checkModpackSlugAvailability: async (slug: string, fetchOptions?: BetterFetchOption) => {
        const res = await $fetch<{
          available: boolean;
          suggestion?: string;
          alternatives?: string[];
        }>(`/modpacks/slug-availability`, {
          query: { slug },
          ...fetchOptions,
        });
        return res;
      },
      updateModpack: async (
        slug: string,
        data: Partial<Modpacks>,
        fetchOptions?: BetterFetchOption,
      ) => {
        const res = await $fetch<Modpacks>(`/modpacks/${slug}`, {
          method: "PUT",
          body: data,
          ...fetchOptions,
        });
        return res;
      },
      deleteModpack: async (slug: string, fetchOptions?: BetterFetchOption) => {
        const res = await $fetch<Modpacks>(`/modpacks/${slug}`, {
          method: "DELETE",
          ...fetchOptions,
        });
        return res;
      },
      getModpackBySlug: async (slug: string, fetchOptions?: BetterFetchOption) => {
        const res = await $fetch<Modpacks>(`/modpacks/${slug}`, {
          ...fetchOptions,
        });
        return res;
      },
      getModpackVersions: async (slug: string, fetchOptions?: BetterFetchOption) => {
        const res = await $fetch<Version[]>(`/modpacks/${slug}/versions`, {
          ...fetchOptions,
        });
        return res;
      },
      getModpackVersion: async (
        slug: string,
        version: string,
        fetchOptions?: BetterFetchOption,
      ) => {
        const res = await $fetch<Version>(`/modpacks/${slug}/versions/${version}`, {
          ...fetchOptions,
        });
        return res;
      },
      createModpackVersion: async (
        slug: string,
        data: CreateModpackVersion,
        fetchOptions?: BetterFetchOption,
      ) => {
        const res = await $fetch<Version>(`/modpacks/${slug}/versions`, {
          method: "POST",
          body: data,
          ...fetchOptions,
        });
        return res;
      },
      updateModpackVersion: async (
        slug: string,
        version: string,
        data: Partial<Version>,
        fetchOptions?: BetterFetchOption,
      ) => {
        const res = await $fetch<Version>(`/modpacks/${slug}/versions/${version}`, {
          method: "PUT",
          body: data,
          ...fetchOptions,
        });
        return res;
      },
      deleteModpackVersion: async (
        slug: string,
        version: string,
        fetchOptions?: BetterFetchOption,
      ) => {
        const res = await $fetch<Version>(`/modpacks/${slug}/versions/${version}`, {
          method: "DELETE",
          ...fetchOptions,
        });
        return res;
      },
      downloadModpackVersion: async (
        slug: string,
        version: string,
        fetchOptions?: BetterFetchOption,
      ) => {
        const res = await $fetch<Version>(`/modpacks/${slug}/versions/${version}/download`, {
          method: "POST",
          ...fetchOptions,
        });
        return res;
      },
      uploadModpackVersionConfig: async (
        slug: string,
        formData: FormData,
        fetchOptions?: BetterFetchOption,
      ) => {
        const res = await $fetch<{
          url: string;
          key: string;
        }>(`https://vsapi.betterjs.dev/api/modpacks/${slug}/versions/upload`, {
          method: "POST",
          body: formData,
          ...fetchOptions,
        });
        return res;
      },
    }),
    getAtoms: ($fetch) => {
      const $modpacks = atom<boolean>(false);
      const modpacks = useAuthQuery<{ totalCount: number; modpacks: ModpackItem[] }>(
        $modpacks,
        "/modpacks",
        $fetch,
        {
          method: "GET",
        },
      );
      return {
        $modpacks,
        modpacks,
      };
    },
    atomListeners: [
      {
        matcher: (path) =>
          path.startsWith("/modpacks") || path.includes("sign-in") || path.includes("sign-out"),
        signal: "$modpacks",
      },
    ],
  }) satisfies BetterAuthClientPlugin;
