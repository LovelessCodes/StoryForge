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
  changelog?: string | null;
  manifestVersion?: number;
  manifestHash?: string | null;
  modConfigsSha256?: string | null;
  modConfigsSize?: number | null;
  createdAt: number;
  updatedAt: number;
};

/** One resolved mod file inside a structured (manifestVersion 1) manifest. */
export type ModpackManifestMod = {
  modId: number;
  modIdStr: string;
  name: string;
  modVersion: string;
  releaseId: number | null;
  fileId: number;
  filename: string;
  url: string;
  sha256: string | null;
  size: number | null;
  side: string;
  required: boolean;
  sortOrder: number;
  gameVersions: string[] | null;
  compatible: boolean | null;
  verified: boolean;
};

export type ModpackManifestConfigs = {
  url: string;
  sha256: string | null;
  size: number | null;
} | null;

export type ModpackManifestV1 = {
  manifestVersion: 1;
  legacy: false;
  slug: string;
  name: string;
  version: string;
  gameVersion: string | null;
  publishedAt: string;
  manifestHash: string;
  generatedAt: string;
  mods: ModpackManifestMod[];
  modConfigs: ModpackManifestConfigs;
};

/** Pre-manifest versions keep working through `modsString` only. */
export type ModpackManifestLegacy = {
  manifestVersion: 0;
  legacy: true;
  slug: string;
  name: string;
  version: string;
  gameVersion: string | null;
  modsString: string | null;
  mods: [];
  modConfigs: ModpackManifestConfigs;
};

export type ModpackManifest = ModpackManifestV1 | ModpackManifestLegacy;

/** Input shape accepted by the manifest write endpoints. */
export type ModpackManifestModInput = {
  modId: number;
  fileId: number;
  url: string;
  releaseId?: number;
  filename?: string;
  required?: boolean;
  side?: "client" | "server" | "both";
  sortOrder?: number;
};

type CreateModpackVersion = {
  version: string;
  gameVersion: string;
  modConfigsUrl: string;
  modsString: string;
  modpack: string;
  mods?: ModpackManifestModInput[];
  changelog?: string;
  modConfigsSha256?: string;
  modConfigsSize?: number;
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
      getModpackManifest: (slug: string, version: string, fetchOptions?: BetterFetchOption) =>
        $fetch<ModpackManifest>(`/modpacks/${slug}/versions/${version}/manifest`, {
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
          sha256: string;
          size: number;
        }>(`https://vsapi.betterjs.dev/api/modpacks/${slug}/versions/upload`, {
          method: "POST",
          body: formData,
          ...fetchOptions,
        }),
    }),
    getAtoms: ($fetch) => {
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
