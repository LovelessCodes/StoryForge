import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";

import type { ForeignInstallation } from "@/lib/types";

export const mvlModpacksQueryKey = ["mvlModpacks"] as const;

/** Modpacks found in MVL's config (scgm0/MVL). */
export const useMvlModpacks = () =>
  useQuery({
    queryFn: () => invoke<ForeignInstallation[]>("detect_mvl_modpacks"),
    queryKey: mvlModpacksQueryKey,
    staleTime: Infinity,
  });
