import { type UseQueryOptions, keepPreviousData, useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";

export type ModUpdatesResponse = {
  statuscode: string;
  updates: {
    [key: string]: ModUpdate;
  };
};

export type ModUpdate = {
  releaseid: number;
  mainfile: string;
  filename: string;
  fileid: number;
  downloads: number;
  tags: string[];
  modidstr: string;
  modversion: string;
  created: string;
};

export const modUpdatesQueryKey = (path: string, params?: string) =>
  params !== undefined ? ["modUpdates", path, params] : ["modUpdates", path];

export const useModUpdates = (
  { path, params }: { path: string; params: string },
  props?: Omit<
    UseQueryOptions<ModUpdatesResponse, Error, ModUpdatesResponse>,
    "queryKey" | "queryFn"
  >,
) => {
  return useQuery({
    queryFn: () => invoke("get_mod_updates", { params }) as Promise<ModUpdatesResponse>,
    queryKey: modUpdatesQueryKey(path, params),
    staleTime: Infinity,
    placeholderData: keepPreviousData,
    ...props,
  });
};
