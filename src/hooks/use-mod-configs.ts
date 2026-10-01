import { type UseQueryOptions, keepPreviousData, useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";

import type { JSONValue } from "@/lib/types";

export const modConfigsQueryKey = (profileId: number) => ["mod-configs", profileId];

export const useModConfigs = (
  profileId: number,
  props?: Omit<
    UseQueryOptions<
      { filename: string; content: JSONValue }[],
      Error,
      { filename: string; content: JSONValue }[]
    >,
    "queryKey" | "queryFn"
  >,
) =>
  useQuery({
    queryFn: () =>
      invoke("get_mod_configs", { profileId }) as Promise<
        { filename: string; content: JSONValue }[]
      >,
    queryKey: modConfigsQueryKey(profileId),
    staleTime: Infinity,
    placeholderData: keepPreviousData,
    ...props,
  });
