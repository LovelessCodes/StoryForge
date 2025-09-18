import {
	closestCenter,
	DndContext,
	type DragEndEvent,
	type DraggableAttributes,
	type DraggableSyntheticListeners,
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
	useSortable,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { listen } from "@tauri-apps/api/event";
import clsx from "clsx";
import {
	DownloadCloudIcon,
	FileDownIcon,
	FileUpIcon,
	FolderIcon,
	FolderPlusIcon,
	PackageOpenIcon,
	PackagePlusIcon,
	PlayIcon,
	StarIcon,
	WrenchIcon,
	XIcon,
} from "lucide-react";
import { useRef } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { useDownloadVersion } from "@/hooks/use-download-version";
import { useInstalledMods } from "@/hooks/use-installed-mods";
import {
	installedVersionsQueryKey,
	useInstalledVersions,
} from "@/hooks/use-installed-versions";
import { usePlayInstallation } from "@/hooks/use-play-installation";
import { useRevealInFolder } from "@/hooks/use-reveal-in-folder";
import type { ProgressPayload } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useDialogStore } from "@/stores/dialogs";
import { type Installation, useInstallations } from "@/stores/installations";

export const Route = createFileRoute("/installations")({
	component: RouteComponent,
});

type InstallationRowProps = {
	installation: Installation;
	onPlay: ({ id }: { id: number }) => void;
	onFavorite: (id: number) => void;
	onOpenFolder: (path: string) => void;
	listeners?: DraggableSyntheticListeners;
	attributes?: DraggableAttributes;
	isDragging?: boolean;
	setNodeRef?: (el: HTMLElement | null) => void;
	style?: React.CSSProperties;
};

function InstallationRow({
	installation,
	onPlay,
	onFavorite,
	onOpenFolder,
	listeners,
	attributes,
	isDragging,
	setNodeRef,
	style,
}: InstallationRowProps) {
	const router = useRouter();
	const listenRef = useRef<() => void>(null);
	const { data: versions } = useInstalledVersions();
	const queryClient = useQueryClient();
	const { mutate: installVersion } = useDownloadVersion({
		onError: (error, v) => {
			listenRef.current?.();
			toast.error(`Error downloading game version: ${error.message}`, {
				id: `download-game-version-${v}`,
			});
		},
		onMutate: async (v) => {
			toast.loading(`Starting to download game version ${v}...`, {
				id: `download-game-version-${v}`,
			});
			listenRef.current = await listen<ProgressPayload>(
				`download://version:${v.replace(/\./g, "_")}`,
				(event) => {
					const { phase, percent } = event.payload;
					if (phase === "download") {
						toast.loading(
							`Downloading game version ${v}: ${percent?.toFixed(0)}%`,
							{
								id: `download-game-version-${v}`,
							},
						);
					}
					if (phase === "extract") {
						toast.loading(`Extracting game version ${v}`, {
							id: `download-game-version-${v}`,
						});
					}
				},
			);
		},
		onSuccess: (d, v) => {
			listenRef.current?.();
			if (d === "already_downloaded") {
				toast.dismiss(`download-game-version-${v}`);
				return;
			}
			toast.success(`Game version ${v} downloaded`, {
				id: `download-game-version-${v}`,
			});
			queryClient.invalidateQueries({
				queryKey: installedVersionsQueryKey(),
			});
		},
	});
	const { data: installationMods } = useInstalledMods(installation.path);
	const version = versions?.find((v) => v === installation.version);
	const { openDialog } = useDialogStore();

	const exportInstallation = async () => {
		const data = {
			mods: installationMods?.mods.map((m) => ({
				id: m.modid,
				version: m.version,
			})),
			name: installation.name,
			version: installation.version,
		};
		// Copy to clipboard
		await window.navigator.clipboard.writeText(JSON.stringify(data, null, 2));
		toast.success("Installation copied to clipboard");
	};
	return (
		<div
			className={clsx([
				"flex items-center gap-2 border-b border-b-muted py-2 px-2",
				isDragging ? "opacity-50 bg-muted" : "opacity-100",
			])}
			ref={setNodeRef}
			style={{
				...style,
				transition: "background 0.2s",
			}}
		>
			{/* Drag handle */}
			<span
				className="cursor-grab select-none px-2 text-lg"
				{...attributes}
				{...listeners}
			>
				≡
			</span>
			<span className="flex-1">
				{installation.name}{" "}
				<span className="opacity-50 text-xs">
					(
					<span className={version ? "text-green-300" : "text-red-300"}>
						{installation.version}
					</span>
					)
				</span>
			</span>
			<div className="inline-flex -space-x-px rounded-md shadow-xs rtl:space-x-reverse">
				<Tooltip>
					<TooltipTrigger asChild>
						{version ? (
							<Button
								className="rounded-none shadow-none first:rounded-s-md last:rounded-e-md focus-visible:z-10"
								onClick={() =>
									onPlay({
										id: installation.id,
									})
								}
								variant="outline"
							>
								<PlayIcon
									aria-hidden="true"
									className="-ms-1 opacity-60 text-green-300"
									size={16}
								/>
							</Button>
						) : (
							<Button
								className="rounded-none shadow-none first:rounded-s-md last:rounded-e-md focus-visible:z-10"
								onClick={() => installVersion(installation.version)}
								variant="outline"
							>
								<DownloadCloudIcon
									aria-hidden="true"
									className="-ms-1 opacity-60 text-yellow-300"
									size={16}
								/>
							</Button>
						)}
					</TooltipTrigger>
					<TooltipContent>
						{version ? "Play" : `Install ${installation.version}`}
					</TooltipContent>
				</Tooltip>
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							className="rounded-none shadow-none first:rounded-s-md last:rounded-e-md focus-visible:z-10"
							onClick={() => onFavorite(installation.id)}
							variant="outline"
						>
							<StarIcon
								aria-hidden="true"
								className={cn(
									"-ms-1",
									installation.favorite
										? "fill-yellow-300 text-yellow-300 opacity-100"
										: "opacity-60",
								)}
								size={16}
							/>
						</Button>
					</TooltipTrigger>
					<TooltipContent>
						{installation.favorite ? "Unfavorite" : "Favorite"}
					</TooltipContent>
				</Tooltip>
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							className="rounded-none shadow-none first:rounded-s-md last:rounded-e-md focus-visible:z-10"
							onClick={() =>
								router.navigate({
									params: { id: installation.id.toString() },
									to: "/install-mods/$id",
									viewTransition: {
										types: ["warp"],
									},
								})
							}
							variant="outline"
						>
							<PackagePlusIcon
								aria-hidden="true"
								className="-ms-1 opacity-60"
								size={16}
							/>
						</Button>
					</TooltipTrigger>
					<TooltipContent>Add Mods</TooltipContent>
				</Tooltip>
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							className="rounded-none shadow-none first:rounded-s-md last:rounded-e-md focus-visible:z-10"
							onClick={() =>
								router.navigate({
									params: { id: installation.id.toString() },
									to: "/mod-configs/$id",
									viewTransition: {
										types: ["warp"],
									},
								})
							}
							variant="outline"
						>
							<PackageOpenIcon
								aria-hidden="true"
								className="-ms-1 opacity-60"
								size={16}
							/>
						</Button>
					</TooltipTrigger>
					<TooltipContent>Edit Mod Configurations</TooltipContent>
				</Tooltip>
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							aria-label="Open folder"
							className="rounded-none shadow-none first:rounded-s-md last:rounded-e-md focus-visible:z-10"
							onClick={() => onOpenFolder(installation.path)}
							size="icon"
							variant="outline"
						>
							<FolderIcon aria-hidden="true" className="opacity-60" size={16} />
						</Button>
					</TooltipTrigger>
					<TooltipContent>Open folder</TooltipContent>
				</Tooltip>
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							className="rounded-none shadow-none first:rounded-s-md last:rounded-e-md focus-visible:z-10"
							onClick={() => exportInstallation()}
							variant="outline"
						>
							<FileUpIcon
								aria-hidden="true"
								className="-ms-1 opacity-60"
								size={16}
							/>
						</Button>
					</TooltipTrigger>
					<TooltipContent>Export</TooltipContent>
				</Tooltip>
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							className="rounded-none shadow-none first:rounded-s-md last:rounded-e-md focus-visible:z-10"
							onClick={() =>
								openDialog("EditInstallationDialog", { installation })
							}
							variant="outline"
						>
							<WrenchIcon
								aria-hidden="true"
								className="-ms-1 opacity-60"
								size={16}
							/>
						</Button>
					</TooltipTrigger>
					<TooltipContent>Edit</TooltipContent>
				</Tooltip>
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							aria-label="Delete"
							className="rounded-none shadow-none first:rounded-s-md last:rounded-e-md focus-visible:z-10"
							onClick={() =>
								openDialog("DeleteInstallationDialog", { installation })
							}
							size="icon"
							variant="outline"
						>
							<XIcon aria-hidden="true" className="opacity-60" size={16} />
						</Button>
					</TooltipTrigger>
					<TooltipContent>Delete</TooltipContent>
				</Tooltip>
			</div>
		</div>
	);
}

type SortableInstallationRowProps = Omit<
	InstallationRowProps,
	"setNodeRef" | "attributes" | "listeners" | "isDragging" | "style"
> & {
	installation: Installation;
};

function SortableInstallationRow(props: SortableInstallationRowProps) {
	const { installation } = props;
	const {
		attributes,
		listeners,
		setNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({ id: installation.id });
	const style = {
		transform: CSS.Transform.toString(transform),
		transition,
	};
	return (
		<InstallationRow
			{...props}
			attributes={attributes}
			isDragging={isDragging}
			listeners={listeners}
			setNodeRef={setNodeRef}
			style={style}
		/>
	);
}

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
