import { WorldMapViewer } from "@/components/maps/world-map-viewer";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import type { World } from "@/lib/types";
import { useDialogStore } from "@/stores/dialogs";

export type ViewMapDialogProps = {
	world: World;
};

export function ViewMapDialog({
	open,
	world,
}: {
	open: boolean;
} & ViewMapDialogProps) {
	const { closeDialog } = useDialogStore();
	const worldData = world.data;
	const worldPath = world.path;
	const mapMarkers = world.map_markers;
	const prospectingLogs = world.prospecting_logs;

	return (
		<Dialog onOpenChange={closeDialog} open={open}>
			<DialogClose />
			<DialogContent
				className="p-0 gap-0 flex flex-col"
				style={{
					height: "85vh",
					maxHeight: "85vh",
					maxWidth: "80vw",
					width: "80vw",
				}}
			>
				<DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
					<DialogTitle>{worldData.world_name} - World Map</DialogTitle>
					<DialogDescription>
						Interactive map viewer • Drag to pan • Scroll to zoom
					</DialogDescription>
				</DialogHeader>

				<div className="flex-1 min-h-0 w-full overflow-hidden p-4">
					<WorldMapViewer
						mapMarkers={mapMarkers}
						prospectingLogs={prospectingLogs}
						worldPath={worldPath}
					/>
				</div>
			</DialogContent>
		</Dialog>
	);
}
