import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";

import type { ForeignInstallation } from "@/lib/types";

export const rustoryInstancesQueryKey = ["rustoryInstances"] as const;

/** Instances found in Rustory's data folder (XurxoMF/rustory). */
export const useRustoryInstances = () =>
  useQuery({
    queryFn: () => invoke<ForeignInstallation[]>("detect_rustory_instances"),
    queryKey: rustoryInstancesQueryKey,
    staleTime: Infinity,
  });
