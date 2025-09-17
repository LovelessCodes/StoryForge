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
import { installedVersionsQueryKey } from "@/hooks/use-installed-versions";
import { useDialogStore } from "@/stores/dialogs";
import { useInstallations } from "@/stores/installations";
import { useServerStore } from "@/stores/servers";

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
	const { installations } = useInstallations();
	const { servers } = useServerStore();
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
					</AlertDialogDescription>
				</AlertDialogHeader>
				{installations.some((inst) => inst.version === version) && (
					<div className="flex flex-col gap-2 my-4 px-1 text-sm">
						<p className="text-red-600">
							Warning: This version is currently in use by the following
							installation(s):
							<ul className="list-disc list-inside">
								{installations
									.filter((inst) => inst.version === version)
									.map((inst) => (
										<li key={inst.id}>
											{inst.name}
											{servers
												.filter((srv) => srv.installationId === inst.id)
												.map((srv) => (
													<ul
														className="list-disc list-inside ml-4"
														key={srv.id}
													>
														<li className="text-xs text-gray-500" key={srv.id}>
															(Server: {srv.name} - {srv.ip}
															{srv.port && `:${srv.port}`})
														</li>
													</ul>
												))}
										</li>
									))}
							</ul>
						</p>
					</div>
				)}
				<AlertDialogFooter>
					<AlertDialogCancel>Cancel</AlertDialogCancel>
					<AlertDialogAction
						disabled={
							isPending ||
							installations.some((inst) => inst.version === version)
						}
						onClick={() => removeVersion(version)}
					>
						{isPending ? "Deleting..." : "Delete"}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
