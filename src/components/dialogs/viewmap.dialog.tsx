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
			<DialogContent className="max-w-[90vw] max-h-[90vh] h-[90vh]">
				<DialogHeader>
					<DialogTitle>{worldData.world_name} - World Map</DialogTitle>
					<DialogDescription>
						Interactive map viewer • Drag to pan • Scroll to zoom
					</DialogDescription>
				</DialogHeader>

				<div className="flex-1 h-full overflow-hidden">
					<WorldMapViewer worldPath={worldPath} />
				</div>
			</DialogContent>
		</Dialog>
	);
}

