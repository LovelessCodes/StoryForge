import { useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useRef } from "react";
import { toast } from "sonner";
import type { Mod } from "@/components/lists/mod.list";
import type { ModInfo, ProgressPayload } from "@/lib/types";
import type { Installation } from "@/stores/installations";
import { installedModsQueryKey } from "./use-installed-mods";
import { modUpdatesQueryKey } from "./use-mod-updates";

export const useAddLatestModVersion = ({
	mod,
	installation,
}: {
	mod: Mod;
	installation: Installation | null;
}) => {
	const emitevent = `mod-download-${mod.modid}-${installation?.id}`;
	const queryClient = useQueryClient();
	const listenRef = useRef<UnlistenFn>(null);
	return useMutation({
		mutationFn: async ({ path }: { path: string }) => {
			const modInfo = (await invoke("fetch_mod_info", {
				modid: mod.modid.toString(),
			})) as ModInfo;
			(await invoke("download_and_maybe_extract", {
				destpath: path,
				emitevent,
				extract: false,
				url: modInfo.mod.releases[0]?.mainfile,
			})) as string;
			return { modInfo };
		},
		onError: (error, _, result) => {
			toast.error(
				`Error downloading ${result?.modInfo?.mod.name} to ${installation?.name}: ${error.message}`,
				{ id: `add-mod-${result?.modInfo?.mod.modid}-${installation?.id}` },
			);
			listenRef.current?.();
		},
		onMutate: async () => {
			const modInfo = (await invoke("fetch_mod_info", {
				modid: mod.modid.toString(),
			})) as ModInfo;
			toast.loading(
				`Downloading ${modInfo?.mod.name} to ${installation?.name}...`,
				{
					id: `add-mod-${modInfo?.mod.modid}-${installation?.id}`,
				},
			);
			listenRef.current = await listen<ProgressPayload>(emitevent, (event) => {
				const { phase, percent } = event.payload;
				if (phase === "download") {
					toast.loading(
						`Downloading ${modInfo?.mod.name} to ${installation?.name}... ${percent?.toFixed(0)}%`,
						{ id: `add-mod-${modInfo?.mod.modid}-${installation?.id}` },
					);
				}
			});
			return {
				modInfo,
			};
		},
		onSuccess: async (_, __, { modInfo }) => {
			if (installation === null) return;
			listenRef.current?.();
			toast.success(
				`Successfully downloaded ${modInfo?.mod.name} to ${installation.name}`,
				{ id: `add-mod-${modInfo?.mod.modid}-${installation.id}` },
			);
			await queryClient.invalidateQueries({
				queryKey: modUpdatesQueryKey(installation.id),
			});
			await queryClient.invalidateQueries({
				queryKey: installedModsQueryKey(installation.path),
			});
		},
	});
};
