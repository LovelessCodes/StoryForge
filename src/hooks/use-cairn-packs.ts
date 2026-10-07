import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";

import type { ForeignInstallation } from "@/lib/types";

export const cairnPacksQueryKey = ["cairnPacks"] as const;

/** Packs found in Cairn's data folder (cairns-gg/cairn-app). */
export const useCairnPacks = () =>
  useQuery({
    queryFn: () => invoke<ForeignInstallation[]>("detect_cairn_packs"),
    queryKey: cairnPacksQueryKey,
    staleTime: Infinity,
  });
