import { useMutation, useQueryClient } from "@tanstack/react-query";
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
import { useInstallations } from "@/stores/installations";

export function DeleteVersionDialog({ version }: { version: string }) {
	const queryClient = useQueryClient();
	const [open, setOpen] = useState(false);
	const { installations } = useInstallations();
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
		onSuccess: () => {
			toast.success(`Version ${version} deleted`, {
				id: `version-delete-${version}`,
			});
			queryClient.invalidateQueries({ queryKey: ["installedVersions"] });
			setOpen(false);
		},
	});

	return (
		<AlertDialog
			onOpenChange={(op) => {
				if (isPending) return;
				if (op === false) setOpen(false);
			}}
			open={open}
		>
			<AlertDialogTrigger asChild>
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							aria-label="Delete"
							className="rounded-none shadow-none first:rounded-s-md last:rounded-e-md focus-visible:z-10"
							disabled={installations.some((inst) => inst.version === version)}
							onClick={() => setOpen(true)}
							size="icon"
							variant="outline"
						>
							<XIcon aria-hidden="true" className="opacity-60" size={16} />
						</Button>
					</TooltipTrigger>
					<TooltipContent>
						{installations.some((inst) => inst.version === version)
							? `Used in ${installations.filter((inst) => inst.version === version)[0].name}${
									installations.filter((inst) => inst.version === version)
										.length > 1
										? ` and ${installations.filter((inst) => inst.version === version).length - 2} other installation(s)`
										: ""
								}`
							: "Delete"}
					</TooltipContent>
				</Tooltip>
			</AlertDialogTrigger>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>
						Are you sure you want to delete version {version}?
					</AlertDialogTitle>
					<AlertDialogDescription>
						This action cannot be undone. This will permanently delete version{" "}
						{version} from Story Forge.
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
