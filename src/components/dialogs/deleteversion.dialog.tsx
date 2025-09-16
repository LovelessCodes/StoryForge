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
import { installedVersionsQueryKey } from "@/hooks/use-installed-versions";
import { useInstallations } from "@/stores/installations";
import { useServerStore } from "@/stores/servers";

export function DeleteVersionDialog({ version }: { version: string }) {
	const queryClient = useQueryClient();
	const [open, setOpen] = useState(false);
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
		onSuccess: () => {
			toast.success(`Version ${version} deleted`, {
				id: `version-delete-${version}`,
			});
			queryClient.invalidateQueries({ queryKey: installedVersionsQueryKey() });
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
							onClick={() => setOpen(true)}
							size="icon"
							variant="outline"
						>
							<XIcon aria-hidden="true" className="opacity-60" size={16} />
						</Button>
					</TooltipTrigger>
					<TooltipContent>Delete</TooltipContent>
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
