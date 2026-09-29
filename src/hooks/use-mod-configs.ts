import { type UseQueryOptions, keepPreviousData, useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";

import type { JSONValue } from "@/lib/types";

export const modConfigsQueryKey = (installationId: number) => ["mod-configs", installationId];

export const useModConfigs = (
  installationId: number,
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
      invoke("get_mod_configs", { installationId }) as Promise<
        { filename: string; content: JSONValue }[]
      >,
    queryKey: modConfigsQueryKey(installationId),
    staleTime: Infinity,
    placeholderData: keepPreviousData,
    ...props,
  });
