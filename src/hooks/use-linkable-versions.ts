import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";

import type { LinkableVersion } from "@/lib/types";

export const linkableVersionsQueryKey = ["linkableVersions"] as const;

/** Game versions found in the data of other launchers (linkable in place). */
export const useLinkableVersions = () =>
  useQuery({
    queryFn: () => invoke<LinkableVersion[]>("detect_linkable_versions"),
    queryKey: linkableVersionsQueryKey,
    staleTime: Infinity,
  });
