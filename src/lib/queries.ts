import { keepPreviousData } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";

import type { ModTag } from "./types";

export const modTagsQuery = {
  placeholderData: keepPreviousData,
  queryFn: () => invoke("fetch_mod_tags") as Promise<ModTag[]>,
  queryKey: ["modTags"],
  staleTime: Infinity,
  refetchOnWindowFocus: false,
};

export const gameVersionsQuery = {
  placeholderData: keepPreviousData,
  queryFn: () => invoke("fetch_versions") as Promise<string[]>,
  queryKey: ["gameVersions"],
  staleTime: Infinity,
  refetchOnWindowFocus: false,
};

export type HostPlatform = {
  os: string;
  arch: string;
  appleSilicon: boolean;
  translated: boolean;
  rosettaAvailable: boolean;
};

/**
 * Hardware facts `tauri_plugin_os` cannot answer: its `arch()` is the
 * architecture the app was built for, which stays x86_64 when an Intel build
 * runs under Rosetta on Apple Silicon.
 */
export const hostPlatformQuery = {
  queryFn: () => invoke("get_host_platform") as Promise<HostPlatform>,
  queryKey: ["hostPlatform"],
  staleTime: Infinity,
  refetchOnWindowFocus: false,
};
