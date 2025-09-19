import { type UseQueryOptions, useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";

export const useSaves = (
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
