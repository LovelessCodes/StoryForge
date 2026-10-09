import { type UseQueryOptions, keepPreviousData, useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";

import type { MapBounds, MapTile } from "@/lib/types";

// ── Query key factories ──

export const worldMapKeys = {
  all: ["world-map"] as const,
  allTiles: (worldPath: string) => [...worldMapKeys.all, "tiles", worldPath] as const,
  bounds: (worldPath: string) => [...worldMapKeys.all, "bounds", worldPath] as const,
};

// ── World-based hooks (existing) ──

export const useMapBounds = (
  worldPath: string,
  options?: Omit<
    UseQueryOptions<MapBounds | null, Error, MapBounds | null>,
    "queryKey" | "queryFn"
  >,
) =>
  useQuery({
    enabled: !!worldPath,
    // The backend returns null for a world with no map tiles yet.
    queryFn: () => invoke<MapBounds | null>("get_map_bounds", { worldPath }),
    queryKey: worldMapKeys.bounds(worldPath),
    staleTime: Infinity,
    placeholderData: keepPreviousData,
    ...options,
  });

export const useAllMapTiles = (
  worldPath: string,
  options?: Omit<UseQueryOptions<MapTile[], Error, MapTile[]>, "queryKey" | "queryFn">,
) =>
  useQuery({
    enabled: !!worldPath,
    queryFn: () => invoke<MapTile[]>("get_all_map_tiles", { worldPath }),
    queryKey: worldMapKeys.allTiles(worldPath),
    staleTime: Infinity,
    placeholderData: keepPreviousData,
    ...options,
  });

// ── Map listing (all profiles) ──

export type MapEntry = {
  id: number;
  name: string;
  profile_id: number;
  profile_name: string;
  path: string;
  size_bytes: number;
};

const allMapsKeys = ["all-maps"] as const;

export const useAllMaps = (
  options?: Omit<UseQueryOptions<MapEntry[], Error, MapEntry[]>, "queryKey" | "queryFn">,
) =>
  useQuery({
    queryFn: () => invoke<MapEntry[]>("get_all_maps"),
    queryKey: allMapsKeys,
    staleTime: 1000 * 60 * 2,
    ...options,
  });

// ── Direct-path variants (no world needed) ──

const dirMapKeys = {
  bounds: (mapPath: string) => ["map-bounds-direct", mapPath] as const,
  tiles: (mapPath: string) => ["map-tiles-direct", mapPath] as const,
};

export const useMapBoundsByPath = (
  mapPath: string,
  options?: Omit<
    UseQueryOptions<MapBounds | null, Error, MapBounds | null>,
    "queryKey" | "queryFn"
  >,
) =>
  useQuery({
    enabled: !!mapPath,
    // The backend returns null for a map database without tiles.
    queryFn: () => invoke<MapBounds | null>("get_map_bounds_by_path", { mapPath }),
    queryKey: dirMapKeys.bounds(mapPath),
    ...options,
  });

export const useAllMapTilesByPath = (
  mapPath: string,
  options?: Omit<UseQueryOptions<MapTile[], Error, MapTile[]>, "queryKey" | "queryFn">,
) =>
  useQuery({
    enabled: !!mapPath,
    queryFn: () => invoke<MapTile[]>("get_all_map_tiles_by_path", { mapPath }),
    queryKey: dirMapKeys.tiles(mapPath),
    staleTime: 1000 * 60 * 5,
    ...options,
  });

// ── Utilities ──

export function imageDataToDataUrl(imageData: number[]): string {
  const bytes = new Uint8Array(imageData);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = btoa(binary);
  return `data:image/png;base64,${base64}`;
}
