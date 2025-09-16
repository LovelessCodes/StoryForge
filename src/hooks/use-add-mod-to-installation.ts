import { type UseMutationOptions, useMutation } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import type { ModInfo } from "@/lib/types";
import type { Installation } from "@/stores/installations";

export const useAddModToInstallation = (
	props?: UseMutationOptions<
		string,
		Error,
		{
			installation: Installation;
			mod: ModInfo;
			version: string;
			emitevent: string;
		}
	>,
) => {
	return useMutation({
		...props,
		mutationFn: async ({ installation, mod: { mod }, version, emitevent }) =>
			invoke("download_and_maybe_extract", {
				destpath: `${installation.path}/Mods`,
				emitevent,
				extract: false,
				url: mod.releases.find((r) => r.modversion === version)?.mainfile,
			}) as Promise<string>,
	});
};
