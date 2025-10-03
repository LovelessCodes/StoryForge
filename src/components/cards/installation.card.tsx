import { useQueryClient } from "@tanstack/react-query";
import { listen } from "@tauri-apps/api/event";
import { formatDistanceToNow } from "date-fns";
import {
	DownloadCloudIcon,
	PackagePlusIcon,
	Pencil,
	Play,
	Star,
} from "lucide-react";
import { useRef } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useDownloadVersion } from "@/hooks/use-download-version";
import {
	installedVersionsQueryKey,
	useInstalledVersions,
} from "@/hooks/use-installed-versions";
import type { ProgressPayload } from "@/lib/types";
import type { Installation } from "@/stores/installations";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";

interface InstallationCardProps {
	installation: Installation;
	onPlay: (installation: Installation) => void;
	onUnfavorite: (installation: Installation) => void;
	onEdit: (installation: Installation) => void;
	onAddMods: (installation: Installation) => void;
}

export function InstallationCard({
	installation,
	onPlay,
	onUnfavorite,
	onEdit,
	onAddMods,
}: InstallationCardProps) {
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

	const { data: versions } = useInstalledVersions();
	return (
		<>
			<div className="flex items-center gap-3">
				<div
					className={`h-2 w-2 rounded-full ${
						versions.includes(installation.version)
							? "bg-green-500"
							: "bg-muted-foreground/40"
					}`}
				/>
				<Tooltip>
					<TooltipTrigger className="flex flex-col justify-start">
						<p className="font-mono text-sm text-foreground">
							{installation.name}
						</p>
						{installation.version && (
							<p className="font-mono text-xs text-muted-foreground">
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
			<div className="flex items-center gap-1">
				<Tooltip>
					{versions.includes(installation.version) ? (
						<>
							<TooltipTrigger asChild>
								<Button
									className="h-8 w-8 text-muted-foreground hover:text-foreground"
									onClick={() => onPlay(installation)}
									size="icon"
									variant="ghost"
								>
									<Play className="h-4 w-4" />
									<span className="sr-only">Play {installation.name}</span>
								</Button>
							</TooltipTrigger>
							<TooltipContent>Play {installation.name}</TooltipContent>
						</>
					) : (
						<>
							<TooltipTrigger asChild>
								<Button
									className="h-8 w-8 text-muted-foreground hover:text-foreground"
									onClick={() => installVersion(installation.version)}
									size="icon"
									variant="ghost"
								>
									<DownloadCloudIcon className="h-4 w-4" />
									<span className="sr-only">
										Download version {installation.version}
									</span>
								</Button>
							</TooltipTrigger>
							<TooltipContent>
								Download version {installation.version}
							</TooltipContent>
						</>
					)}
				</Tooltip>
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							className="h-8 w-8 text-muted-foreground hover:text-foreground"
							onClick={() => onAddMods(installation)}
							size="icon"
							variant="ghost"
						>
							<PackagePlusIcon className="h-4 w-4" />
							<span className="sr-only">Add mods to {installation.name}</span>
						</Button>
					</TooltipTrigger>
					<TooltipContent>Add mods</TooltipContent>
				</Tooltip>
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							className="h-8 w-8 text-muted-foreground hover:text-foreground"
							onClick={() => onEdit(installation)}
							size="icon"
							variant="ghost"
						>
							<Pencil className="h-4 w-4" />
							<span className="sr-only">Edit {installation.name}</span>
						</Button>
					</TooltipTrigger>
					<TooltipContent>Edit {installation.name}</TooltipContent>
				</Tooltip>
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							className="h-8 w-8"
							onClick={() => onUnfavorite(installation)}
							size="icon"
							variant="ghost"
						>
							<Star
								className={`h-4 w-4 ${
									installation.favorite
										? "fill-warning text-warning"
										: "text-muted-foreground hover:text-foreground"
								}`}
							/>
							<span className="sr-only">
								{installation.favorite ? "Unfavorite" : "Favorite"}{" "}
								{installation.name}
							</span>
						</Button>
					</TooltipTrigger>
					<TooltipContent>
						{installation.favorite ? "Unfavorite" : "Favorite"}
					</TooltipContent>
				</Tooltip>
			</div>
		</>
	);
}
