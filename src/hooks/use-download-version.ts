import { type UseMutationOptions, useMutation } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { zipfolderprefix } from "@/lib/utils";
import { useAppFolder } from "./use-app-folder";

export const useDownloadVersion = (
	props?: UseMutationOptions<string, Error, string>,
) => {
	const { appFolder } = useAppFolder();
	return useMutation({
		mutationFn: async (version: string) => {
			const url = (await invoke("get_download_link", {
				version,
			})) as string;
			if (!url) {
				throw new Error("Download URL not found in response");
			}
			const downloadUrl = url;
			if (!appFolder) {
				throw new Error("App folder not found");
			}
			return invoke("download_and_maybe_extract", {
				destpath: `${appFolder}/versions/${version}`,
				emitevent: `download://version:${version.replace(/\./g, "_")}`,
				extract: true,
				extractdir: `${appFolder}/versions/${version}`,
				url: downloadUrl,
				zipsubfolderprefix: zipfolderprefix(),
			}) as Promise<string>;
		},
		...props,
	});
};
