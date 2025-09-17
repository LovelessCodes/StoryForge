import { useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAddModToInstallation } from "@/hooks/use-add-mod-to-installation";
import { useAppFolder } from "@/hooks/use-app-folder";
import { installedModsQueryKey } from "@/hooks/use-installed-mods";
import { modUpdatesQueryKey } from "@/hooks/use-mod-updates";
import type { ModInfo, ProgressPayload } from "@/lib/types";
import { makeStringFolderSafe } from "@/lib/utils";
import { useDialogStore } from "@/stores/dialogs";
import { useInstallations } from "@/stores/installations";

const installationSchema = z.object({
	mods: z.array(
		z.object({
			id: z.string(),
			version: z.string(),
		}),
	),
	name: z.string().min(2).max(100),
	version: z.string().min(2).max(100),
});

export function ImportInstallationDialog({ open }: { open: boolean }) {
	const [newInstallation, setNewInstallation] = useState<string>("");
	const { addInstallation, installations } = useInstallations();
	const { closeDialog } = useDialogStore();
	const listenRef = useRef<() => void>(null);
	const queryClient = useQueryClient();
	const { appFolder } = useAppFolder();

	const { mutate: addModToInstallation, isPending } = useAddModToInstallation({
		onError: (error, variables) => {
			toast.error(
				`Error adding ${variables.mod.mod.name} to ${variables.installation.name}: ${error.message}`,
				{
					id: `add-mod-${variables.mod.mod.modid}-${variables.installation.id}`,
				},
			);
			listenRef.current?.();
		},
		onMutate: async (variables) => {
			toast.loading(
				`Adding ${variables.mod.mod.name} to ${variables.installation.name}...`,
				{
					id: `add-mod-${variables.mod.mod.modid}-${variables.installation.id}`,
				},
			);
			listenRef.current = await listen<ProgressPayload>(
				variables.emitevent,
				(event) => {
					const { phase, percent } = event.payload;
					if (phase === "download") {
						toast.loading(
							`Downloading ${variables.mod.mod.name} to ${variables.installation.name}... ${percent?.toFixed(0)}%`,
							{
								id: `add-mod-${variables.mod.mod.modid}-${variables.installation.id}`,
							},
						);
					}
				},
			);
		},
		onSuccess: async (_, variables) => {
			listenRef.current?.();
			toast.success(
				`Successfully added ${variables.mod.mod.name} to ${variables.installation.name}`,
				{
					id: `add-mod-${variables.mod.mod.modid}-${variables.installation.id}`,
				},
			);
			await queryClient.invalidateQueries({
				queryKey: installedModsQueryKey(variables.installation.path),
			});
			await queryClient.invalidateQueries({
				queryKey: modUpdatesQueryKey(variables.installation.id),
			});
			closeDialog();
		},
	});

	const { mutateAsync: initializeGame } = useMutation({
		mutationFn: (path: string) =>
			invoke("initialize_game", { path }) as Promise<string>,
		onError: (error, path) => {
			toast.error(`Error initializing game: ${error}`, {
				id: `initialize-game-${path}`,
			});
		},
		onMutate: (path) => {
			toast.loading(`Initializing game...`, {
				id: `initialize-game-${path}`,
			});
		},
		onSuccess: async (_, path) => {
			toast.success(`Game initialized`, {
				id: `initialize-game-${path}`,
			});

			const installation = installationSchema.safeParse(
				JSON.parse(newInstallation.replace(/[“”]/g, '"').replace(/[‘’]/g, "'")),
			);
			if (installation.success) {
				const installationId = Date.now();
				const newInstallation = {
					favorite: false,
					icon: "",
					id: installationId,
					index: installations.length,
					lastTimePlayed: 0,
					name: installation.data.name,
					path,
					startParams: "",
					totalTimePlayed: 0,
					version: installation.data.version,
				};
				addInstallation(newInstallation);

				for (const mod of installation.data.mods) {
					const modInfo = (await invoke("fetch_mod_info", {
						modid: mod.id,
					})) as ModInfo | null;
					if (modInfo) {
						addModToInstallation({
							emitevent: `import-installation-${installationId}-${mod.id}`,
							installation: newInstallation,
							mod: modInfo,
							version: mod.version,
						});
					}
				}
			}
		},
	});

	const handleImportInstallation = async () => {
		const installation = installationSchema.safeParse(
			JSON.parse(newInstallation.replace(/[“”]/g, '"').replace(/[‘’]/g, "'")),
		);
		if (installation.success) {
			await initializeGame(
				`${appFolder}/installations/${makeStringFolderSafe(installation.data.name)}`,
			);
		}
	};

	return (
		<AlertDialog
			onOpenChange={() => {
				if (isPending) return;
				closeDialog();
			}}
			open={open}
		>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>Import a new installation</AlertDialogTitle>
					<AlertDialogDescription>
						Enter the JSON configuration of the installation you want to import.
					</AlertDialogDescription>
				</AlertDialogHeader>
				<textarea
					className="w-full h-48 p-2 border rounded resize-none"
					onChange={(e) => setNewInstallation(e.target.value)}
					placeholder="Paste installation JSON here..."
					value={newInstallation}
				/>
				<AlertDialogFooter>
					<AlertDialogCancel>Cancel</AlertDialogCancel>
					<AlertDialogAction
						disabled={isPending || newInstallation.trim() === ""}
						onClick={() => handleImportInstallation()}
					>
						{isPending ? "Importing..." : "Import"}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
