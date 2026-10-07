import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";

import type { ForeignInstallation } from "@/lib/types";

export const lithicInstancesQueryKey = ["lithicInstances"] as const;

/** Instances found in Lithic's data folder (NotAShelf/lithic). */
export const useLithicInstances = () =>
  useQuery({
    queryFn: () => invoke<ForeignInstallation[]>("detect_lithic_instances"),
    queryKey: lithicInstancesQueryKey,
    staleTime: Infinity,
  });
