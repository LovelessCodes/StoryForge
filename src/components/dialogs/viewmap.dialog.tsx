import type { GameData } from "@/hooks/use-saves";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { useDialogStore } from "@/stores/dialogs";
import { WorldMapViewer } from "@/components/maps/world-map-viewer";

export type ViewMapDialogProps = {
	world: [GameData, string, string];
};

export function ViewMapDialog({
	open,
	world,
}: {
	open: boolean;
} & ViewMapDialogProps) {
	const { closeDialog } = useDialogStore();
	const worldData = world[0];
	const worldPath = world[1];

	return (
		<Dialog onOpenChange={closeDialog} open={open}>
			<DialogClose />
			<DialogContent 
				className="p-0 gap-0 flex flex-col"
				style={{
					width: "80vw",
					height: "80vh",
					maxWidth: "80vw",
					maxHeight: "80vh",
				}}
			>
				<DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
					<DialogTitle>{worldData.world_name} - World Map</DialogTitle>
					<DialogDescription>
						Interactive map viewer • Drag to pan • Scroll to zoom
					</DialogDescription>
				</DialogHeader>

				<div className="flex-1 min-h-0 w-full overflow-hidden p-4">
					<WorldMapViewer worldPath={worldPath} />
				</div>
			</DialogContent>
		</Dialog>
	);
}

