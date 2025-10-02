import { useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { addSeconds, formatDistance, formatDistanceToNow } from "date-fns";
import { motion } from "framer-motion";
import { useId, useState } from "react";
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
import type { GameData } from "@/hooks/use-saves";
import { useDialogStore } from "@/stores/dialogs";
import { Checkbox } from "../ui/checkbox";

export type DeleteWorldDialogProps = {
	world: [GameData, string, string];
};

export function DeleteWorldDialog({
	open,
	world,
}: {
	open: boolean;
} & DeleteWorldDialogProps) {
	const id = useId();
	const queryClient = useQueryClient();
	const { closeDialog } = useDialogStore();
	const { mutate: removeWorld, isPending } = useMutation({
		mutationFn: (world: [GameData, string, string]) =>
			invoke("remove_world", { worldPath: world[1] }),
		onError: (error) => {
			toast.error(`Failed to delete world ${world[0].world_name}: ${error}`, {
				id: `world-delete-${world[0].world_name}`,
			});
		},
		onMutate: () => {
			toast.loading(`Deleting world ${world[0].world_name}...`, {
				id: `world-delete-${world[0].world_name}`,
			});
		},
		onSuccess: async () => {
			toast.success(`World ${world[0].world_name} deleted`, {
				id: `world-delete-${world[0].world_name}`,
			});
			await queryClient.invalidateQueries({
				queryKey: ["saves"],
			});
			closeDialog();
		},
	});

	const [sure, setSure] = useState(false);

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
						Are you sure you want to delete the world{" "}
						<span className="text-destructive">{world[0].world_name}</span>?
					</AlertDialogTitle>
					<AlertDialogDescription>
						This action cannot be undone. This will permanently delete world{" "}
						<span className="text-destructive">{world[0].world_name}</span> from
						Story Forge.
						<motion.div
							animate={{ opacity: 1, y: 0 }}
							className="my-4 rounded-md border border-warning bg-warning/10 p-3 flex flex-col text-warning-foreground"
							exit={{ opacity: 0, y: -10 }}
							initial={{ opacity: 0, y: -10 }}
							transition={{ duration: 0.3 }}
						>
							<p className="mb-4">
								<b>Warning:</b> This will delete the world from your computer.
								If you want to keep a backup, make sure to export it before
								proceeding.
							</p>
							<p>
								<b>World info:</b>
							</p>
							<ul className="list-disc pl-5">
								<li>
									World name: <b>{world[0].world_name}</b>
								</li>
								<li>
									Map identifier: <b>{world[0].savegame_identifier}</b>
								</li>
								<li>
									World type: <b>{world[0].world_type}</b>
								</li>
								<li>
									Play style: <b>{world[0].play_style}</b>
								</li>
								<li>
									Created by: <b>{world[0].created_by_player_name}</b>
								</li>
								<li>
									Last played:{" "}
									<b>
										{world[0].last_played
											? formatDistanceToNow(new Date(world[0].last_played), {
													addSuffix: true,
												})
											: "Never"}
									</b>
								</li>
								<li>
									Last session:{" "}
									<b>
										{formatDistance(
											new Date(),
											addSeconds(new Date(), world[0].total_seconds_played),
										)}
									</b>
								</li>
								<li>
									Seed: <b>{world[0].seed}</b>
								</li>
								<li>
									Created in version: <b>{world[0].created_game_version}</b>
								</li>
								<li>
									Last saved in version:{" "}
									<b>{world[0].last_saved_game_version}</b>
								</li>
							</ul>
						</motion.div>
						{/* Add a checkbox asking if they're absolutely sure */}
						<div className="flex items-center">
							<Checkbox
								checked={sure}
								className="mr-2"
								id={`confirm-delete-${id}`}
								onCheckedChange={(v) => setSure(!!v)}
							/>
							<label className="text-sm" htmlFor={`confirm-delete-${id}`}>
								I understand that this action cannot be undone.
							</label>
						</div>
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>Cancel</AlertDialogCancel>
					<AlertDialogAction
						disabled={isPending || !sure}
						onClick={() => removeWorld(world)}
					>
						{isPending ? "Deleting..." : "Delete"}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
