import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";

import type { ForeignInstallation } from "@/lib/types";

export const gruntLauncherInstancesQueryKey = ["gruntLauncherInstances"] as const;

/** Instances found in GruntLauncher's data folder (renarin-kholin/gruntlauncher). */
export const useGruntLauncherInstances = () =>
  useQuery({
    queryFn: () => invoke<ForeignInstallation[]>("detect_gruntlauncher_instances"),
    queryKey: gruntLauncherInstancesQueryKey,
    staleTime: Infinity,
  });
