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
  createdAt: number;
  updatedAt: number;
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
  createdAt: number;
  updatedAt: number;
};

type CreateModpackVersion = {
  version: string;
  gameVersion: string;
  modConfigsUrl: string;
  modsString: string;
  modpack: string;
};

export const modpacksPlugin = () => {
  const $modpacks = atom<number>(0);
  return {
    id: "modpacks-client-plugin",
    getActions: ($fetch, $store) => ({
      getModpacks: (
        data?: {
          offset?: number;
          limit?: number;
          search?: string;
          sortBy?: string;
          order?: "asc" | "desc";
          owner?: string;
        },
        fetchOptions?: BetterFetchOption,
      ) =>
        $fetch<{ totalCount: number; modpacks: Modpacks[] }>("/modpacks", {
          query: data,
          ...fetchOptions,
        }),
      createModpack: (data: CreateModpack, fetchOptions?: BetterFetchOption) =>
        $fetch<Modpacks>("/modpacks", {
          method: "POST",
          body: data,
          ...fetchOptions,
          onSuccess: (res) => {
            $modpacks.set(Math.random());
            $store.notify("$modpacks");
            void fetchOptions?.onSuccess?.(res);
          },
        }),
      checkModpackSlugAvailability: (slug: string, fetchOptions?: BetterFetchOption) =>
        $fetch<{
          available: boolean;
          suggestion?: string;
          alternatives?: string[];
        }>(`/modpacks/slug-availability`, {
          query: { slug },
          ...fetchOptions,
        }),
      updateModpack: (slug: string, data: Partial<Modpacks>, fetchOptions?: BetterFetchOption) =>
        $fetch<Modpacks>(`/modpacks/${slug}`, {
          method: "PUT",
          body: data,
          ...fetchOptions,
          onSuccess: (res) => {
            $modpacks.set(Math.random());
            $store.notify("$modpacks");
            void fetchOptions?.onSuccess?.(res);
          },
        }),
      deleteModpack: (slug: string, fetchOptions?: BetterFetchOption) =>
        $fetch<Modpacks>(`/modpacks/${slug}`, {
          method: "DELETE",
          ...fetchOptions,
          onSuccess: (res) => {
            $modpacks.set(Math.random());
            $store.notify("$modpacks");
            void fetchOptions?.onSuccess?.(res);
          },
        }),
      getModpackBySlug: (slug: string, fetchOptions?: BetterFetchOption) =>
        $fetch<Modpacks>(`/modpacks/${slug}`, {
          ...fetchOptions,
        }),
      getModpackVersions: (slug: string, fetchOptions?: BetterFetchOption) =>
        $fetch<Version[]>(`/modpacks/${slug}/versions`, {
          ...fetchOptions,
        }),
      getModpackVersion: (slug: string, version: string, fetchOptions?: BetterFetchOption) =>
        $fetch<Version>(`/modpacks/${slug}/versions/${version}`, {
          ...fetchOptions,
        }),
      createModpackVersion: (
        slug: string,
        data: CreateModpackVersion,
        fetchOptions?: BetterFetchOption,
      ) =>
        $fetch<Version>(`/modpacks/${slug}/versions`, {
          method: "POST",
          body: data,
          ...fetchOptions,
          onSuccess: (res) => {
            $modpacks.set(Math.random());
            $store.notify("$modpacks");
            void fetchOptions?.onSuccess?.(res);
          },
        }),
      updateModpackVersion: (
        slug: string,
        version: string,
        data: Partial<Version>,
        fetchOptions?: BetterFetchOption,
      ) =>
        $fetch<Version>(`/modpacks/${slug}/versions/${version}`, {
          method: "PUT",
          body: data,
          ...fetchOptions,
          onSuccess: (res) => {
            $modpacks.set(Math.random());
            $store.notify("$modpacks");
            void fetchOptions?.onSuccess?.(res);
          },
        }),
      deleteModpackVersion: (slug: string, version: string, fetchOptions?: BetterFetchOption) =>
        $fetch<Version>(`/modpacks/${slug}/versions/${version}`, {
          method: "DELETE",
          ...fetchOptions,
          onSuccess: (res) => {
            $modpacks.set(Math.random());
            $store.notify("$modpacks");
            void fetchOptions?.onSuccess?.(res);
          },
        }),
      downloadModpackVersion: (slug: string, version: string, fetchOptions?: BetterFetchOption) =>
        $fetch<Version>(`/modpacks/${slug}/versions/${version}/download`, {
          method: "POST",
          ...fetchOptions,
          onSuccess: (res) => {
            $modpacks.set(Math.random());
            $store.notify("$modpacks");
            void fetchOptions?.onSuccess?.(res);
          },
        }),
      uploadModpackVersionConfig: (
        slug: string,
        formData: FormData,
        fetchOptions?: BetterFetchOption,
      ) =>
        $fetch<{
          url: string;
          key: string;
        }>(`https://vsapi.betterjs.dev/api/modpacks/${slug}/versions/upload`, {
          method: "POST",
          body: formData,
          ...fetchOptions,
        }),
    }),
    getAtoms: ($fetch) => {
      // react-doctor-disable-next-line react-doctor/rules-of-hooks
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
          path.startsWith("/modpacks") || path === "/sign-in" || path === "/sign-out",
        signal: "$modpacks",
      },
    ],
  } satisfies BetterAuthClientPlugin;
};
