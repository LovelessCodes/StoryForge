import { type UseQueryOptions, keepPreviousData, useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";

import type { MapBounds, MapDatabaseInfo, MapTile } from "@/lib/types";

// ── Query key factories ──

export const worldMapKeys = {
  all: ["world-map"] as const,
  allTiles: (worldPath: string) => [...worldMapKeys.all, "tiles", worldPath] as const,
  bounds: (worldPath: string) => [...worldMapKeys.all, "bounds", worldPath] as const,
  inspection: (worldPath: string) => [...worldMapKeys.all, "inspection", worldPath] as const,
  tile: (worldPath: string, position: number) =>
    [...worldMapKeys.all, "tile", worldPath, position] as const,
};

// ── World-based hooks (existing) ──

export const useMapDatabaseInspection = (
  worldPath: string,
  options?: Omit<UseQueryOptions<MapDatabaseInfo, Error, MapDatabaseInfo>, "queryKey" | "queryFn">,
) =>
  useQuery({
    enabled: !!worldPath,
    queryFn: () => invoke<MapDatabaseInfo>("inspect_map_database", { worldPath }),
    queryKey: worldMapKeys.inspection(worldPath),
    staleTime: Infinity,
    placeholderData: keepPreviousData,
    ...options,
  });

export const useMapBounds = (
  worldPath: string,
  options?: Omit<UseQueryOptions<MapBounds, Error, MapBounds>, "queryKey" | "queryFn">,
) =>
  useQuery({
    enabled: !!worldPath,
    queryFn: () => invoke<MapBounds>("get_map_bounds", { worldPath }),
    queryKey: worldMapKeys.bounds(worldPath),
    staleTime: Infinity,
    placeholderData: keepPreviousData,
    ...options,
  });

export const useMapTile = (
  worldPath: string,
  position: number,
  options?: Omit<UseQueryOptions<MapTile, Error, MapTile>, "queryKey" | "queryFn">,
) =>
  useQuery({
    enabled: !!worldPath && position !== undefined,
    queryFn: () => invoke<MapTile>("get_map_tile", { position, worldPath }),
    queryKey: worldMapKeys.tile(worldPath, position),
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

// ── Map listing (all installations) ──

export type MapEntry = {
  id: number;
  name: string;
  installation_id: number;
  installation_name: string;
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
  options?: Omit<UseQueryOptions<MapBounds, Error, MapBounds>, "queryKey" | "queryFn">,
) =>
  useQuery({
    enabled: !!mapPath,
    queryFn: () => invoke<MapBounds>("get_map_bounds_by_path", { mapPath }),
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

// ── Map favorites (localStorage-backed) ──

const FAV_KEY = "storyforge-map-favorites";

export function getFavoriteMaps(): Set<number> {
  try {
    const raw = localStorage.getItem(FAV_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

export function saveFavoriteMaps(favorites: Set<number>) {
  localStorage.setItem(FAV_KEY, JSON.stringify([...favorites]));
}

export function toggleFavoriteMap(mapId: number) {
  const favs = getFavoriteMaps();
  if (favs.has(mapId)) {
    favs.delete(mapId);
  } else {
    favs.add(mapId);
  }
  saveFavoriteMaps(favs);
  return favs;
}

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

export function createImageFromTile(tile: MapTile): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = imageDataToDataUrl(tile.image_data);
  });
}
