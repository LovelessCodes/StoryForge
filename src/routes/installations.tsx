import {
	closestCenter,
	DndContext,
	type DragEndEvent,
	PointerSensor,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import {
	restrictToParentElement,
	restrictToVerticalAxis,
} from "@dnd-kit/modifiers";
import {
	SortableContext,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { createFileRoute } from "@tanstack/react-router";
import { FileDownIcon, FolderPlusIcon } from "lucide-react";
import { SortableInstallationRow } from "@/components/rows/sortable.installation.row";
import { Button } from "@/components/ui/button";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { usePlayInstallation } from "@/hooks/use-play-installation";
import { useRevealInFolder } from "@/hooks/use-reveal-in-folder";
import { useDialogStore } from "@/stores/dialogs";
import { useInstallations } from "@/stores/installations";

export const Route = createFileRoute("/installations")({
	component: RouteComponent,
});

function RouteComponent() {
	const { installations, moveInstallation, toggleFavorite } =
		useInstallations();
	const { openDialog } = useDialogStore();

	// DnD-kit setup
	const sensors = useSensors(useSensor(PointerSensor));
	const installationIds = installations.map((s) => s.id);
	const { mutate: playWithInstallation } = usePlayInstallation();
	const { mutate: openFolder } = useRevealInFolder();

	function handleDragEnd(event: DragEndEvent) {
		const { active, over } = event;
		if (active.id !== over?.id) {
			const oldIndex = installations.findIndex((s) => s.id === active.id);
			const newIndex = installations.findIndex((s) => s.id === over?.id);
			if (oldIndex !== -1 && newIndex !== -1) {
				moveInstallation(active.id as number, newIndex);
			}
		}
	}

	return (
		<div className="flex flex-col gap-2 w-full">
			<div className="grid grid-cols-[1fr_min-content] gap-2 h-fit sticky top-0 bg-background/10 backdrop-blur-md z-10 px-4 py-2">
				<Button
					className="w-full justify-between cursor-pointer"
					onClick={() => openDialog("AddInstallationDialog")}
					variant="outline"
				>
					<span className="flex text-xs">Add installation</span>
					<FolderPlusIcon className="size-4" />
				</Button>
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							aria-label="Import installation"
							className="shadow-none focus-visible:z-10"
							onClick={() => openDialog("ImportInstallationDialog")}
							size="icon"
							variant="outline"
						>
							<FileDownIcon aria-hidden="true" size={16} />
						</Button>
					</TooltipTrigger>
					<TooltipContent>Import Installation</TooltipContent>
				</Tooltip>
			</div>
			<DndContext
				collisionDetection={closestCenter}
				modifiers={[restrictToParentElement, restrictToVerticalAxis]}
				onDragEnd={handleDragEnd}
				sensors={sensors}
			>
				<SortableContext
					items={installationIds}
					strategy={verticalListSortingStrategy}
				>
					<div className="rounded shadow divide-y">
						{installations
							.sort((a, b) => a.index - b.index)
							.map((installation) => (
								<SortableInstallationRow
									installation={installation}
									key={installation.id}
									onFavorite={toggleFavorite}
									onOpenFolder={openFolder}
									onPlay={playWithInstallation}
								/>
							))}
					</div>
				</SortableContext>
			</DndContext>
		</div>
	);
}
