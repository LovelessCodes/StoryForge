import { type UseMutationOptions, useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";

export const useInstalledVersions = (props?: UseMutationOptions<string[]>) => {
	return useQuery({
		initialData: [],
		queryFn: () => invoke<string[]>("get_installed_versions"),
		queryKey: ["installedVersions"],
		...props,
	});
};
