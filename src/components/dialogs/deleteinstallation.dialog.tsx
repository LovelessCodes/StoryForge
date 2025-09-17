import { useMutation } from "@tanstack/react-query";
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
import { useDialogStore } from "@/stores/dialogs";
import { type Installation, useInstallations } from "@/stores/installations";
import { useServerStore } from "@/stores/servers";

export type DeleteInstallationDialogProps = {
	installation: Installation;
};

export function DeleteInstallationDialog({
	open,
	installation,
}: {
	open: boolean;
} & DeleteInstallationDialogProps) {
	const { removeInstallation } = useInstallations();
	const { closeDialog } = useDialogStore();
	const { servers } = useServerStore();

	const canDelete = !servers.some(
		(srv) => srv.installationId === installation.id,
	);

	const { mutate: deleteInstallation, isPending } = useMutation({
		mutationFn: async (id: number) => invoke("remove_installation", { id }),
		onError: (error, variables) => {
			toast.error(`Error deleting installation: ${error}`, {
				id: `installation-delete-${variables}`,
			});
		},
		onMutate: (variables) => {
			toast.loading("Deleting installation...", {
				id: `installation-delete-${variables}`,
			});
		},
		onSuccess: (data, variables) => {
			if (data === "removed") {
				removeInstallation(variables);
				toast.success("Installation deleted", {
					id: `installation-delete-${variables}`,
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
						Are you sure you want to delete this installation?
					</AlertDialogTitle>
					<AlertDialogDescription>
						This action cannot be undone. This will permanently delete the
						installation from your computer as well as all its data.
					</AlertDialogDescription>
				</AlertDialogHeader>
				{servers.some((srv) => srv.installationId === installation.id) && (
					<div className="flex flex-col gap-2 my-4 px-1 text-sm">
						<p className="text-red-600">
							Warning: This installation is currently in use by the following
							server(s):
							<ul className="list-disc list-inside">
								{servers
									.filter((srv) => srv.installationId === installation.id)
									.map((srv) => (
										<li key={srv.id}>
											{srv.name} ({srv.ip}:{srv.port})
										</li>
									))}
							</ul>
						</p>
					</div>
				)}
				<AlertDialogFooter>
					<AlertDialogCancel>Cancel</AlertDialogCancel>
					<AlertDialogAction
						disabled={!canDelete || isPending}
						onClick={() => deleteInstallation(installation.id)}
					>
						{isPending ? "Deleting..." : "Delete"}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
