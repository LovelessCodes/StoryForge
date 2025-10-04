import type {
	DraggableAttributes,
	DraggableSyntheticListeners,
} from "@dnd-kit/core";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { listen } from "@tauri-apps/api/event";
import { formatDistanceToNow } from "date-fns";
import {
	DownloadCloudIcon,
	FileUpIcon,
	FolderIcon,
	PackageOpenIcon,
	PackagePlusIcon,
	PenIcon,
	PlayIcon,
	StarIcon,
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
import type { ProgressPayload } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useDialogStore } from "@/stores/dialogs";
import type { Installation } from "@/stores/installations";

export type InstallationRowProps = {
	installation: Installation;
	onPlay: ({ id, save }: { id: number; save?: string }) => void;
	onFavorite: (id: number) => void;
	onOpenFolder: (path: string) => void;
	listeners?: DraggableSyntheticListeners;
	attributes?: DraggableAttributes;
	isDragging?: boolean;
	setNodeRef?: (el: HTMLElement | null) => void;
	style?: React.CSSProperties;
};

export function InstallationRow({
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
	const { mutate: installVersion, isPending: isInstalling } =
		useDownloadVersion({
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
			className={cn([
				"flex items-center gap-2 py-2 px-2",
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
			<div className="flex items-center flex-1 gap-3">
				<Tooltip>
					<TooltipTrigger className="flex flex-col justify-start">
						<p className="text-sm text-foreground">{installation.name}</p>
						{installation.version && (
							<p className="text-xs text-muted-foreground">
								v{installation.version}
							</p>
						)}
					</TooltipTrigger>
					<TooltipContent>
						Last played:{" "}
						{installation.lastTimePlayed
							? formatDistanceToNow(new Date(installation.lastTimePlayed), {
									addSuffix: true,
								})
							: "Never"}
					</TooltipContent>
				</Tooltip>
			</div>
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
								disabled={isInstalling}
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
										? "fill-warning text-warning opacity-100"
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
							<PenIcon
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
