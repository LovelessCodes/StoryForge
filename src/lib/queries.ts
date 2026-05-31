import { invoke } from "@tauri-apps/api/core";

import type { ModTag } from "./types";

export const modTagsQuery = {
  queryFn: () => invoke("fetch_mod_tags") as Promise<ModTag[]>,
  queryKey: ["modTags"],
  staleTime: Infinity,
};

export const gameVersionsQuery = {
  queryFn: () => invoke("fetch_versions") as Promise<string[]>,
  queryKey: ["gameVersions"],
  staleTime: Infinity,
};
