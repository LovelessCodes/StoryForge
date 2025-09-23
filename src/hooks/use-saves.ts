import { type UseQueryOptions, useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";

// It comes out as [saveName, installationName][]
export const useSaves = (
	props?: Omit<
		UseQueryOptions<[string, string][], Error, [string, string][]>,
		"queryKey" | "queryFn"
	>,
) =>
	useQuery({
		queryFn: () => invoke("get_all_saves") as Promise<[string, string][]>,
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
