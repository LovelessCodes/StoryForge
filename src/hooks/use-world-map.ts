import { type UseQueryOptions, useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import type { MapBounds, MapDatabaseInfo, MapTile } from "@/lib/types";

// Query key factories
export const worldMapKeys = {
	all: ["world-map"] as const,
	allTiles: (worldPath: string) =>
		[...worldMapKeys.all, "tiles", worldPath] as const,
	bounds: (worldPath: string) =>
		[...worldMapKeys.all, "bounds", worldPath] as const,
	inspection: (worldPath: string) =>
		[...worldMapKeys.all, "inspection", worldPath] as const,
	tile: (worldPath: string, position: number) =>
		[...worldMapKeys.all, "tile", worldPath, position] as const,
};

/**
 * Hook to inspect the Maps database for a world
 * Returns schema information, table count, and sample positions
 */
export const useMapDatabaseInspection = (
	worldPath: string,
	options?: Omit<
		UseQueryOptions<MapDatabaseInfo, Error, MapDatabaseInfo>,
		"queryKey" | "queryFn"
	>,
) =>
	useQuery({
		enabled: !!worldPath,
		queryFn: () =>
			invoke<MapDatabaseInfo>("inspect_map_database", { worldPath }),
		queryKey: worldMapKeys.inspection(worldPath),
		...options,
	});

/**
 * Hook to get the bounds (min/max X,Y) of the map
 * Useful for setting up the initial viewport
 */
export const useMapBounds = (
	worldPath: string,
	options?: Omit<
		UseQueryOptions<MapBounds, Error, MapBounds>,
		"queryKey" | "queryFn"
	>,
) =>
	useQuery({
		enabled: !!worldPath,
		queryFn: () => invoke<MapBounds>("get_map_bounds", { worldPath }),
		queryKey: worldMapKeys.bounds(worldPath),
		...options,
	});

/**
 * Hook to get a single map tile by position
 * Useful for testing or lazy loading individual tiles
 */
export const useMapTile = (
	worldPath: string,
	position: number,
	options?: Omit<
		UseQueryOptions<MapTile, Error, MapTile>,
		"queryKey" | "queryFn"
	>,
) =>
	useQuery({
		enabled: !!worldPath && position !== undefined,
		queryFn: () => invoke<MapTile>("get_map_tile", { position, worldPath }),
		queryKey: worldMapKeys.tile(worldPath, position),
		...options,
	});

/**
 * Hook to get all map tiles for a world
 * Use with caution for large maps - consider pagination or lazy loading
 */
export const useAllMapTiles = (
	worldPath: string,
	options?: Omit<
		UseQueryOptions<MapTile[], Error, MapTile[]>,
		"queryKey" | "queryFn"
	>,
) =>
	useQuery({
		enabled: !!worldPath,
		queryFn: () => invoke<MapTile[]>("get_all_map_tiles", { worldPath }),
		queryKey: worldMapKeys.allTiles(worldPath),
		staleTime: 1000 * 60 * 5, // Cache for 5 minutes
		...options,
	});

/**
 * Utility function to convert image_data array to a data URL
 */
export function imageDataToDataUrl(imageData: number[]): string {
	const bytes = new Uint8Array(imageData);
	let binary = "";
	for (let i = 0; i < bytes.length; i++) {
		binary += String.fromCharCode(bytes[i]);
	}
	const base64 = btoa(binary);
	return `data:image/png;base64,${base64}`;
}

/**
 * Utility function to create an Image element from map tile data
 */
export function createImageFromTile(tile: MapTile): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const img = new Image();
		img.onload = () => resolve(img);
		img.onerror = reject;
		img.src = imageDataToDataUrl(tile.image_data);
	});
}
