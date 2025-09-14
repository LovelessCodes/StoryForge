import { useMutation } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { XIcon } from "lucide-react";
import { useState } from "react";
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
	AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { type Installation, useInstallations } from "@/stores/installations";
import { useServerStore } from "@/stores/servers";

export function DeleteInstallationDialog({
	installation,
}: {
	installation: Installation;
}) {
	const [open, setOpen] = useState(false);
	const { removeInstallation } = useInstallations();
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
				setOpen(false);
			}
		},
	});

	return (
		<AlertDialog
			onOpenChange={(op) => {
				if (isPending) return;
				setOpen(op);
			}}
			open={open}
		>
			<AlertDialogTrigger asChild>
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							aria-label="Delete"
							className="rounded-none shadow-none first:rounded-s-md last:rounded-e-md focus-visible:z-10"
							disabled={!canDelete}
							onClick={() => setOpen(true)}
							size="icon"
							variant="outline"
						>
							<XIcon aria-hidden="true" className="opacity-60" size={16} />
						</Button>
					</TooltipTrigger>
					<TooltipContent>
						{canDelete
							? "Delete"
							: `Used in ${servers
									.filter((srv) => srv.installationId === installation.id)
									.map((srv) => srv.name)
									.join(", ")}`}
					</TooltipContent>
				</Tooltip>
			</AlertDialogTrigger>
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
