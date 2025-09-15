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
import { createFileRoute } from "@tanstack/react-router";
import clsx from "clsx";
import { StarIcon, UnplugIcon } from "lucide-react";
import { AddServerDialog } from "@/components/dialogs/addserver.dialog";
import { DeleteServerDialog } from "@/components/dialogs/deleteserver.dialog";
import { EditServerDialog } from "@/components/dialogs/editserver.dialog";
import { Button } from "@/components/ui/button";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { useConnectToServer } from "@/hooks/use-connect-to-server";
import { cn } from "@/lib/utils";
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
								className="-ms-1 opacity-60 text-green-300"
								size={16}
							/>
						</Button>
					</TooltipTrigger>
					<TooltipContent>Connect</TooltipContent>
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
										? "fill-yellow-300 text-yellow-300 opacity-100"
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
				<EditServerDialog server={server} />
				<DeleteServerDialog server={server} />
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
	const navigate = Route.useNavigate();

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
			className="grid grid-rows-[min-content_min-content_1fr] gap-2 w-full"
			style={{ height: "100vh" }}
		>
			<div className="flex justify-end px-2 pt-2">
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							onClick={() =>
								navigate({
									to: "/public-servers",
									viewTransition: {
										types: ["warp"],
									},
								})
							}
							size="sm"
							variant="ghost"
						>
							Public Servers
						</Button>
					</TooltipTrigger>
					<TooltipContent>View public servers</TooltipContent>
				</Tooltip>
			</div>
			<div className="flex flex-col gap-2 w-full justify-start">
				<div className="flex gap-2 h-fit sticky top-0 bg-background/10 backdrop-blur-md z-10 px-4 pb-2">
					<AddServerDialog />
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
