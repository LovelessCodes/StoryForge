import { type UseQueryOptions, useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";

export type GameData = {
	seed: number;
	world_name: string;
	total_game_seconds: number;
	total_seconds_played: number;
	last_played: string | null;
	created_game_version: string;
	last_saved_game_version: string | null;
	created_by_player_name: string;
	play_style: string;
	world_type: string;
};

// It comes out as [gameData, installationName][]
export const useSaves = (
	props?: Omit<
		UseQueryOptions<
			[GameData, string, string][],
			Error,
			[GameData, string, string][]
		>,
		"queryKey" | "queryFn"
	>,
) =>
	useQuery({
		queryFn: () =>
			invoke("get_all_saves") as Promise<[GameData, string, string][]>,
		queryKey: ["saves"],
		...props,
	});

export const useSavesFromInstallation = (
	installationId: number,
	props?: Omit<
		UseQueryOptions<string[], Error, string[]>,
		"queryKey" | "queryFn"
	>,
) =>
	useQuery({
		queryFn: () =>
			invoke("get_installation_saves", { installationId }) as Promise<string[]>,
		queryKey: ["saves", installationId],
		...props,
	});
