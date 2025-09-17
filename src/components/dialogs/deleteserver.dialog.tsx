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
import { type Server, useServerStore } from "@/stores/servers";

export type DeleteServerDialogProps = {
	server: Server;
};

export function DeleteServerDialog({
	open,
	server,
}: {
	open: boolean;
} & DeleteServerDialogProps) {
	const { removeServer } = useServerStore();
	const { closeDialog } = useDialogStore();

	return (
		<AlertDialog onOpenChange={() => closeDialog()} open={open}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>
						Are you sure you want to delete this server?
					</AlertDialogTitle>
					<AlertDialogDescription>
						This action cannot be undone. This will permanently delete the
						server from Story Forge.
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>Cancel</AlertDialogCancel>
					<AlertDialogAction
						onClick={() => {
							removeServer(server.id);
							closeDialog();
						}}
					>
						Delete
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
