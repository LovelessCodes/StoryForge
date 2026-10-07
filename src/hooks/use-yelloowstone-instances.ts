import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";

import type { ForeignInstallation } from "@/lib/types";

export const yelloowstoneInstancesQueryKey = ["yelloowstoneInstances"] as const;

/** Instances found in Yelloowstone's config (jgwoolley/vintage-story-launcher). */
export const useYelloowstoneInstances = () =>
  useQuery({
    queryFn: () => invoke<ForeignInstallation[]>("detect_yelloowstone_instances"),
    queryKey: yelloowstoneInstancesQueryKey,
    staleTime: Infinity,
  });
