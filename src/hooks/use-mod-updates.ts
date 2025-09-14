import { type UseQueryOptions, useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";

type ModUpdatesResponse = {
	statuscode: string;
	updates: {
		[key: string]: {
			releaseid: number;
			mainfile: string;
			filename: string;
			fileid: number;
			downloads: number;
			tags: string[];
			modidstr: string;
			modversion: string;
			created: string;
		};
	};
};

export const useModUpdates = (
	{installation, params}: {installation: number | null, params: string},
	props?: Omit<
		UseQueryOptions<ModUpdatesResponse, Error, ModUpdatesResponse>,
		"queryKey" | "queryFn"
	>,
) => {
	return useQuery({
		queryFn: () =>
			invoke("get_mod_updates", { params }) as Promise<ModUpdatesResponse>,
		queryKey: ["modUpdates", installation],
		...props,
	});
};
