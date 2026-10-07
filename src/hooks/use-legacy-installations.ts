import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";

import type { LegacyInstallation } from "@/lib/types";

export const legacyInstallationsQueryKey = ["legacyInstallations"] as const;

/** Installations found in the previous Story Forge release's data folder. */
export const useLegacyInstallations = () =>
  useQuery({
    queryFn: () => invoke<LegacyInstallation[]>("detect_legacy_installations", { root: null }),
    queryKey: legacyInstallationsQueryKey,
    staleTime: Infinity,
  });
