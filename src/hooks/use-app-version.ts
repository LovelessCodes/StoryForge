import { type UseQueryOptions, useQuery } from "@tanstack/react-query";
import { getVersion } from "@tauri-apps/api/app";

export const useAppVersion = (props?: UseQueryOptions<string, Error>) => {
	return useQuery({
		queryFn: () => getVersion(),
		queryKey: ["app-version"],
		...props,
	});
};
