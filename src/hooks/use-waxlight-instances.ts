import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";

import type { ForeignInstallation } from "@/lib/types";

export const waxlightInstancesQueryKey = ["waxlightInstances"] as const;

/** Instances found in Waxlight Launcher's database (AmadoMuerte). */
export const useWaxlightInstances = () =>
  useQuery({
    queryFn: () => invoke<ForeignInstallation[]>("detect_waxlight_instances"),
    queryKey: waxlightInstancesQueryKey,
    staleTime: Infinity,
  });
