import { useMutation } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { AnimatePresence, motion } from "framer-motion";
import { MapIcon, MapPinXIcon } from "lucide-react";
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
import { useSaves } from "@/hooks/use-saves";
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
	const { data: saves } = useSaves(installation.id);

	const activeServers = servers.filter(
		(srv) => srv.installationId === installation.id,
	);

	const canDelete = activeServers.length === 0;

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

					{/* Warning for active servers */}
					{activeServers.length > 0 && (
						<motion.div
							animate={{ opacity: 1, y: 0 }}
							className="mb-4 rounded-md border border-destructive bg-destructive/10 p-3 text-destructive"
							exit={{ opacity: 0, y: -10 }}
							initial={{ opacity: 0, y: -10 }}
							transition={{ duration: 0.3 }}
						>
							<strong>Warning:</strong>
							<br />
							The following servers are using this installation and must be
							removed first:
							<ul className="mt-2 space-y-1">
								<AnimatePresence>
									{activeServers.map((srv) => (
										<motion.li
											animate={{ opacity: 1, x: 0 }}
											className="pl-2 gap-2 flex items-center border rounded-sm"
											exit={{ opacity: 0, x: 20 }}
											initial={{ opacity: 0, x: -20 }}
											key={srv.id}
											transition={{ duration: 0.2 }}
										>
											<MapPinXIcon className="inline h-4 w-4 mr-1" />
											{srv.name || `Server #${srv.id}`}
										</motion.li>
									))}
								</AnimatePresence>
							</ul>
						</motion.div>
					)}

					{/* List saves if present */}
					{Array.isArray(saves) && saves.length > 0 && (
						<motion.div
							animate={{ opacity: 1, y: 0 }}
							className="mb-4 rounded-md border border-warning bg-warning/10 p-3 text-warning-foreground"
							exit={{ opacity: 0, y: 10 }}
							initial={{ opacity: 0, y: 10 }}
							transition={{ delay: 0.1, duration: 0.3 }}
						>
							<strong>Saves:</strong>
							<br />
							The following saves will be deleted:
							<ul className="mt-2 space-y-1">
								<AnimatePresence>
									{saves.map((save) => (
										<motion.li
											animate={{ opacity: 1, x: 0 }}
											className="pl-2 flex items-center gap-2 border rounded-sm"
											exit={{ opacity: 0, x: -20 }}
											initial={{ opacity: 0, x: 20 }}
											key={save}
											transition={{ duration: 0.2 }}
										>
											<MapIcon className="inline h-4 w-4 mr-1" />
											{save}
										</motion.li>
									))}
								</AnimatePresence>
							</ul>
						</motion.div>
					)}
				</AlertDialogHeader>
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
