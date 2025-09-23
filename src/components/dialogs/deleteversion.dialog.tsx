import { useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { motion } from "framer-motion";
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
import { installedVersionsQueryKey } from "@/hooks/use-installed-versions";
import { useDialogStore } from "@/stores/dialogs";

export type DeleteVersionDialogProps = {
	version: string;
};

export function DeleteVersionDialog({
	open,
	version,
}: {
	open: boolean;
} & DeleteVersionDialogProps) {
	const queryClient = useQueryClient();
	const { closeDialog } = useDialogStore();
	const { mutate: removeVersion, isPending } = useMutation({
		mutationFn: (version: string) =>
			invoke("remove_installed_version", { version }),
		onError: (error) => {
			toast.error(`Failed to delete version ${version}: ${error}`, {
				id: `version-delete-${version}`,
			});
		},
		onMutate: () => {
			toast.loading(`Deleting version ${version}...`, {
				id: `version-delete-${version}`,
			});
		},
		onSuccess: async () => {
			toast.success(`Version ${version} deleted`, {
				id: `version-delete-${version}`,
			});
			await queryClient.invalidateQueries({
				queryKey: installedVersionsQueryKey(),
			});
			closeDialog();
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
						Are you sure you want to delete version {version}?
					</AlertDialogTitle>
					<AlertDialogDescription>
						This action cannot be undone. This will permanently delete version{" "}
						{version} from Story Forge.
						<motion.div
							animate={{ opacity: 1, y: 0 }}
							className="my-4 rounded-md border border-warning bg-warning/10 p-3 text-warning-foreground"
							exit={{ opacity: 0, y: -10 }}
							initial={{ opacity: 0, y: -10 }}
							transition={{ duration: 0.3 }}
						>
							<strong>Note:</strong>
							<br />
							Deleting versions that are currently in use by installations will
							not harm these installations or their servers. However, you will
							not be able to create new installations with this version until
							you reinstall it.
						</motion.div>
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>Cancel</AlertDialogCancel>
					<AlertDialogAction
						disabled={isPending}
						onClick={() => removeVersion(version)}
					>
						{isPending ? "Deleting..." : "Delete"}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
