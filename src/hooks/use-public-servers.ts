import { type UseQueryOptions, useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";

export type PublicServer = {
	serverName: string;
	serverIP: string;
	playstyle: {
		id: string;
		langCode: string;
	};
	mods: {
		id: string;
		version: string;
	}[];
	maxPlayers: string;
	players: number;
	gameVersion: string;
	hasPassword: boolean;
	whitelisted: boolean;
	gameDescription: string;
};

type PublicServersResponse = {
	statuscode: string;
	data: PublicServer[];
};

export const publicServersQuery = () => ({
	keepPreviousData: true,
	queryFn: () =>
		invoke("fetch_public_servers") as Promise<PublicServersResponse>,
	queryKey: ["publicServers"],
	refetchOnWindowFocus: false,
	staleTime: 1000 * 60 * 5, // 5 minutes
});

export const usePublicServers = (
	props?: Omit<
		UseQueryOptions<PublicServersResponse, Error, PublicServersResponse>,
		"queryKey" | "queryFn"
	>,
) =>
	useQuery({
		...props,
		...publicServersQuery(),
	});
