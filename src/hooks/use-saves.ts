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
	total_game_seconds_start: number;
	savegame_identifier: string;
};

export type Position = {
	x: number;
	y: number;
	z: number;
};

export type MapMarkers = {
	markers: MapMarker[];
};

export type MapMarker = {
	icon: string;
	player_uid: string;
	position: Position;
	label: string;
	id: string;
};

export type ProspectingLog = {
	markers: ProspectingMarker[];
};

export type ProspectResult = {
	ore_code: string;
	readings: ProspectReading[];
};

export type ProspectReading = {
	depth: number;
	quality: number;
};

export type ProspectingMarker = {
	position: Position;
	results: ProspectResult[];
};

export type Save = [
	GameData,
	string,
	string,
	MapMarkers,
	[key: string, ProspectingLog],
];

// Vec<(String, ProspectingLog)>
export const useSaves = (
	props?: Omit<UseQueryOptions<Save[], Error, Save[]>, "queryKey" | "queryFn">,
) =>
	useQuery({
		queryFn: () => invoke("get_all_saves") as Promise<Save[]>,
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
