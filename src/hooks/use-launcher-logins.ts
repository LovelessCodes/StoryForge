import { type UseQueryOptions, useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";

export type DetectedLogin = {
  id: string;
  source: string;
  label: string;
  detail: string | null;
};

export const launcherLoginsQueryKey = () => ["launcherLogins"];

/** Saved logins Story Forge can read from other launchers (labels only). */
export const useDetectedLogins = (
  props?: Omit<UseQueryOptions<DetectedLogin[], Error, DetectedLogin[]>, "queryKey" | "queryFn">,
) =>
  useQuery({
    queryFn: () => invoke("detect_launcher_logins") as Promise<DetectedLogin[]>,
    queryKey: launcherLoginsQueryKey(),
    staleTime: 30_000,
    ...props,
  });
