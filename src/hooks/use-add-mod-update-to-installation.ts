import { type UseMutationOptions, useMutation } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { pathDelimiter } from "@/lib/utils";
import type { Installation } from "@/stores/installations";
import type { ModUpdate } from "./use-mod-updates";

export const useAddModUpdateToInstallation = (
	props?: UseMutationOptions<
		string,
		Error,
		{
			installation: Installation;
			mod: ModUpdate;
			emitevent: string;
		}
	>,
) => {
	return useMutation({
		...props,
		mutationFn: async ({ installation, mod, emitevent }) =>
			invoke("download_and_maybe_extract", {
				destpath: `${installation.path}${pathDelimiter}Mods`,
				emitevent,
				extract: false,
				url: mod?.mainfile,
			}) as Promise<string>,
	});
};
