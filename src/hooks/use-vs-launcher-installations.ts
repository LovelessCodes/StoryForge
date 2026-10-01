import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";

import type { ForeignInstallation } from "@/lib/types";

export const vsLauncherInstallationsQueryKey = ["vsLauncherInstallations"] as const;

/** Installations found in VS Launcher's config (XurxoMF/vs-launcher). */
export const useVsLauncherInstallations = () =>
  useQuery({
    queryFn: () => invoke<ForeignInstallation[]>("detect_vs_launcher_installations"),
    queryKey: vsLauncherInstallationsQueryKey,
    staleTime: Infinity,
  });
