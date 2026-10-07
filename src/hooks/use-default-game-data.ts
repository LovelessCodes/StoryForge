import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";

import type { DetectedGameData } from "@/lib/types";

export const defaultGameDataQueryKey = ["defaultGameData"] as const;

/** Vintage Story data folders found in the game's default locations. */
export const useDefaultGameData = () =>
  useQuery({
    queryFn: () => invoke<DetectedGameData[]>("detect_default_game_data"),
    queryKey: defaultGameDataQueryKey,
    staleTime: Infinity,
  });
