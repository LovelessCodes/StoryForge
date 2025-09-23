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
import { createFileRoute } from "@tanstack/react-router";
import { listen } from "@tauri-apps/api/event";
import clsx from "clsx";
import {
	DownloadCloudIcon,
	MapPinPlusIcon,
	StarIcon,
	UnplugIcon,
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
import { useConnectToServer } from "@/hooks/use-connect-to-server";
import { useDownloadVersion } from "@/hooks/use-download-version";
import {
	installedVersionsQueryKey,
	useInstalledVersions,
} from "@/hooks/use-installed-versions";
import type { ProgressPayload } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useDialogStore } from "@/stores/dialogs";
import { type Installation, useInstallations } from "@/stores/installations";
import { type Server, useServerStore } from "@/stores/servers";

export const Route = createFileRoute("/servers")({
	component: RouteComponent,
});

type ServerRowProps = {
	server: Server;
	onConnect: ({
		ip,
		password,
		installationId,
	}: {
		ip: string;
		password: string;
		installationId: number;
	}) => void;
	onFavorite: (id: number) => void;
	installation: Installation | undefined;
	listeners?: DraggableSyntheticListeners;
	attributes?: DraggableAttributes;
	isDragging?: boolean;
	setNodeRef?: (el: HTMLElement | null) => void;
	style?: React.CSSProperties;
};

function ServerRow({
	server,
	onConnect,
	onFavorite,
	installation,
	listeners,
	attributes,
	isDragging,
	setNodeRef,
	style,
}: ServerRowProps) {
	const { openDialog } = useDialogStore();
	const { data: versions } = useInstalledVersions();
	const listenRef = useRef<() => void>(null);
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
				{server.name}{" "}
				<span className="opacity-50 text-xs">
					({server.ip}
					{server.port ? `:${server.port}` : ""} via{" "}
					{installation?.name ?? "Unknown Installation"})
				</span>
			</span>
			<div className="inline-flex -space-x-px rounded-md shadow-xs rtl:space-x-reverse">
				<Tooltip>
					<TooltipTrigger asChild>
						{versions?.includes(installation?.version ?? "") ? (
							<Button
								className="rounded-none shadow-none first:rounded-s-md last:rounded-e-md focus-visible:z-10"
								onClick={() =>
									onConnect({
										installationId: server.installationId,
										ip: `${server.ip}${server.port ? `:${server.port}` : ""}`,
										password: server.password,
									})
								}
								variant="outline"
							>
								<UnplugIcon
									aria-hidden="true"
									className="-ms-1 opacity-60 text-success"
									size={16}
								/>
							</Button>
						) : (
							<Button
								className="rounded-none shadow-none first:rounded-s-md last:rounded-e-md focus-visible:z-10"
								onClick={() => installVersion(installation?.version ?? "")}
								variant="outline"
							>
								<DownloadCloudIcon
									aria-hidden="true"
									className="-ms-1 opacity-60 text-warning"
									size={16}
								/>
							</Button>
						)}
					</TooltipTrigger>
					<TooltipContent>
						{versions?.includes(installation?.version ?? "")
							? "Connect"
							: `Install ${installation?.version ?? ""}`}
					</TooltipContent>
				</Tooltip>
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							className="rounded-none shadow-none first:rounded-s-md last:rounded-e-md focus-visible:z-10"
							onClick={() => onFavorite(server.id)}
							variant="outline"
						>
							<StarIcon
								aria-hidden="true"
								className={cn(
									"-ms-1",
									server.favorite
										? "fill-warning text-warning opacity-100"
										: "opacity-60",
								)}
								size={16}
							/>
						</Button>
					</TooltipTrigger>
					<TooltipContent>
						{server.favorite ? "Unfavorite" : "Favorite"}
					</TooltipContent>
				</Tooltip>
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							className="rounded-none shadow-none first:rounded-s-md last:rounded-e-md focus-visible:z-10"
							onClick={() => openDialog("EditServerDialog", { server })}
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
							onClick={() => openDialog("DeleteServerDialog", { server })}
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

type SortableServerRowProps = Omit<
	ServerRowProps,
	"setNodeRef" | "attributes" | "listeners" | "isDragging" | "style"
> & {
	server: Server;
};

function SortableServerRow(props: SortableServerRowProps) {
	const { server } = props;
	const {
		attributes,
		listeners,
		setNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({ id: server.id });
	const style = {
		transform: CSS.Transform.toString(transform),
		transition,
	};
	return (
		<ServerRow
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
	const { servers, moveServer, toggleFavorite } = useServerStore();
	const { installations } = useInstallations();
	const { openDialog } = useDialogStore();

	// DnD-kit setup
	const sensors = useSensors(useSensor(PointerSensor));
	const serverIds = servers.map((s) => s.id);
	const { mutate: connectToServer } = useConnectToServer();

	function handleDragEnd(event: DragEndEvent) {
		const { active, over } = event;
		if (active.id !== over?.id) {
			const oldIndex = servers.findIndex((s) => s.id === active.id);
			const newIndex = servers.findIndex((s) => s.id === over?.id);
			if (oldIndex !== -1 && newIndex !== -1) {
				moveServer(active.id as number, newIndex);
			}
		}
	}

	return (
		<div
			className="grid grid-rows-[min-content_1fr] gap-2 w-full"
			style={{ height: "100vh" }}
		>
			<div className="flex flex-col gap-2 w-full justify-start">
				<div className="flex gap-2 h-fit sticky top-0 bg-background/10 backdrop-blur-md z-10 px-4 py-2">
					<Button
						className="w-full justify-between cursor-pointer"
						onClick={() => openDialog("AddServerDialog")}
						variant="outline"
					>
						<span className="flex text-xs">Add server</span>
						<MapPinPlusIcon className="size-4" />
					</Button>
				</div>
				<DndContext
					collisionDetection={closestCenter}
					modifiers={[restrictToParentElement, restrictToVerticalAxis]}
					onDragEnd={handleDragEnd}
					sensors={sensors}
				>
					<SortableContext
						items={serverIds}
						strategy={verticalListSortingStrategy}
					>
						<div className="rounded shadow divide-y">
							{servers
								.sort((a, b) => a.index - b.index)
								.map((server) => (
									<SortableServerRow
										installation={installations.find(
											(inst) => inst.id === server.installationId,
										)}
										key={server.id}
										onConnect={connectToServer}
										onFavorite={toggleFavorite}
										server={server}
									/>
								))}
						</div>
					</SortableContext>
				</DndContext>
			</div>
		</div>
	);
}
