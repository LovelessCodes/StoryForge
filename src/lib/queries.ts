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
