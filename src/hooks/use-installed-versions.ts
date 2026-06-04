import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { useMemo } from "react";

export const installedVersionsQueryKey = () => ["installedVersions"] as const;

export type InstalledVersion = {
  name: string;
  size_bytes: number;
  size_display: string;
};

export const useInstalledVersions = () => {
  return useQuery({
    queryFn: () => invoke<InstalledVersion[]>("get_installed_versions"),
    queryKey: installedVersionsQueryKey(),
    staleTime: Infinity,
    placeholderData: keepPreviousData,
  });
};

/** Convenience: just the version strings (for backward compat) */
export const useInstalledVersionNames = () => {
  const { data } = useInstalledVersions();
  return useMemo(() => (data ?? []).map((v) => v.name), [data]);
};
