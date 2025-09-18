import { type UseQueryOptions, useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";

export const modConfigsQueryKey = (installationId: number) => [
	"mod-configs",
	installationId,
];

export const useModConfigs = (
	installationId: number,
	props?: Omit<
		UseQueryOptions<
			{ filename: string; content: string }[],
			Error,
			{ filename: string; content: string }[]
		>,
		"queryKey" | "queryFn"
	>,
) =>
	useQuery({
		queryFn: () =>
			invoke("get_mod_configs", { installationId }) as Promise<
				{ filename: string; content: string }[]
			>,
		queryKey: modConfigsQueryKey(installationId),
		...props,
	});
