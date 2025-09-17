import { useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
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
import { installedModsQueryKey } from "@/hooks/use-installed-mods";
import { useDialogStore } from "@/stores/dialogs";
import type { Installation } from "@/stores/installations";

export type RemoveModDialogProps = {
	name: string;
	path: string;
	installation: Installation;
};

export function RemoveModDialog({
	open,
	name,
	path,
	installation,
}: {
	open: boolean;
} & RemoveModDialogProps) {
	const queryClient = useQueryClient();
	const { closeDialog } = useDialogStore();
	const { mutate: removeModFromInstallation, isPending } = useMutation({
		mutationFn: ({ path, modpath }: { path: string; modpath: string }) =>
			invoke("remove_mod_from_installation", { params: { modpath, path } }),
		onError: (error, variables) => {
			toast.error(
				`Error removing ${name} from ${installation.name}: ${error.message}`,
				{
					id: `mod-remove-${variables.path}-${variables.modpath}`,
				},
			);
		},
		onMutate: (variables) => {
			toast.loading(`Removing ${name} from ${installation.name}...`, {
				id: `mod-remove-${variables.path}-${variables.modpath}`,
			});
		},
		onSuccess: async (data, variables) => {
			if (data === "removed") {
				toast.success(`Removed ${name} from ${installation.name}`, {
					id: `mod-remove-${variables.path}-${variables.modpath}`,
				});
				// Invalidate the mods query to refresh the list
				await queryClient.invalidateQueries({
					queryKey: installedModsQueryKey(installation.path),
				});
				closeDialog();
			}
		},
	});

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
					<AlertDialogTitle>
						Are you sure you want to remove{" "}
						<span className="text-yellow-200">{name}</span> from{" "}
						<span className="text-blue-200">{installation.name}</span>?
					</AlertDialogTitle>
					<AlertDialogDescription>
						This action cannot be undone. This will permanently remove{" "}
						<span className="text-yellow-200">{name}</span> from{" "}
						<span className="text-blue-200">{installation.name}</span>.
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>Cancel</AlertDialogCancel>
					<AlertDialogAction
						disabled={isPending}
						onClick={() =>
							removeModFromInstallation({
								modpath: path,
								path: installation.path,
							})
						}
					>
						Remove
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
