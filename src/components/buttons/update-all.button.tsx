import { useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { useState } from "react";
import { toast } from "sonner";
import { useAddModUpdateToInstallation } from "@/hooks/use-add-mod-update-to-installation";
import { installedModsQueryKey } from "@/hooks/use-installed-mods";
import {
	type ModUpdate,
	type ModUpdatesResponse,
	modUpdatesQueryKey,
} from "@/hooks/use-mod-updates";
import type { OutputMod } from "@/routes/install-mods/$id";
import type { Installation } from "@/stores/installations";
import { Button } from "../ui/button";

export const UpdateAllButton = ({
	installation,
	updates,
	installedMods,
}: {
	installation: Installation;
	updates: ModUpdatesResponse;
	installedMods: OutputMod[];
}) => {
	const emitevent = `mod-updates-${installation?.id}-progress`;
	const queryClient = useQueryClient();
	const [wantsToUpdate, setWantsToUpdate] = useState(false);
	const { mutateAsync: removeModFromInstallation, isPending: removePending } =
		useMutation({
			mutationFn: (variables: {
				path: string;
				modpath: string;
				updateMod: ModUpdate & { modid: string };
			}) =>
				invoke("remove_mod_from_installation", {
					params: { modpath: variables.modpath, path: variables.path },
				}),
			onError: (error, variables) => {
				toast.error(
					`Error removing ${name} from ${installation.name}: ${error.message}`,
					{
						id: `mod-remove-${variables.path}-${variables.modpath}`,
					},
				);
			},
			onSuccess: async (_d, v) => {
				if (installation) {
					await addModToInstallation({
						emitevent,
						installation,
						mod: v.updateMod,
					});
				}
			},
		});

	const { mutateAsync: addModToInstallation, isPending } =
		useAddModUpdateToInstallation({
			onError: (error, variables) => {
				toast.error(
					`Error updating mod in ${variables.installation.name}: ${error.message}`,
					{
						id: `mod-update-${variables.installation.id}-${variables.mod.modidstr}`,
					},
				);
			},
		});

	const handleUpdateAll = async () => {
		if (wantsToUpdate) {
			// Trigger update process for all installed mods with updates
			toast.loading("Downloading mod updates...", {
				id: `mod-updates-${installation.id}`,
			});
			for (const [modid, updateMod] of Object.entries(updates.updates)) {
				const isInstalled = installedMods?.find(
					(instMod) =>
						instMod.modid === Number(modid) ||
						instMod.modid.toString() === updateMod.modidstr,
				);
				if (!isInstalled) continue;
				await removeModFromInstallation({
					modpath: isInstalled.path,
					path: installation.path,
					updateMod: {
						...updateMod,
						modid: modid,
					},
				});
			}
			await queryClient.invalidateQueries({
				queryKey: installedModsQueryKey(installation.path),
			});
			await queryClient.invalidateQueries({
				queryKey: modUpdatesQueryKey(installation.id),
			});
			toast.success(`All mod updates completed for ${installation.name}.`, {
				id: `mod-updates-${installation.id}`,
			});
			// Reset the wantsToUpdate state
			setWantsToUpdate(false);
		} else {
			setWantsToUpdate(true);
		}
	};

	return (
		<Button
			disabled={
				!updates ||
				Object.keys(updates.updates).length === 0 ||
				isPending ||
				removePending
			}
			onClick={() => updates && handleUpdateAll()}
			variant={wantsToUpdate ? "destructive" : "outline"}
		>
			{wantsToUpdate ? "Yes, really" : "Update All"}
		</Button>
	);
};
