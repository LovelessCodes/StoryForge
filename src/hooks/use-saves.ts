import { type UseQueryOptions, keepPreviousData, useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";

import type { World } from "@/lib/types";

// Vec<(String, ProspectingLog)>
export const useSaves = (
  props?: Omit<UseQueryOptions<World[], Error, World[]>, "queryKey" | "queryFn">,
) =>
  useQuery({
    queryFn: () => invoke("get_all_saves") as Promise<World[]>,
    queryKey: ["saves"],
    staleTime: Infinity,
    placeholderData: keepPreviousData,
    ...props,
  });
