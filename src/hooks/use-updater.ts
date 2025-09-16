import { type UseQueryOptions, useQuery } from "@tanstack/react-query";
import { check, type Update } from "@tauri-apps/plugin-updater";

export const useUpdater = (
	props?: UseQueryOptions<Update | null, Error, Update | null>,
) =>
	useQuery({
		queryFn: () => check(),
		queryKey: ["updater"],
		staleTime: 1000 * 60 * 5, // 5 minutes
		...props,
	});
