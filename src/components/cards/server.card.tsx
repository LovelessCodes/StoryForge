import { useQueryClient } from "@tanstack/react-query";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { DownloadCloudIcon, Lock, Pencil, Play, Star } from "lucide-react";
import { useRef } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useDownloadVersion } from "@/hooks/use-download-version";
import {
	installedVersionsQueryKey,
	useInstalledVersions,
} from "@/hooks/use-installed-versions";
import type { ProgressPayload } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useInstallations } from "@/stores/installations";
import type { Server } from "@/stores/servers";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";

interface ServerCardProps {
	server: Server;
	onConnect: (server: Server) => void;
	onUnfavorite: (server: Server) => void;
	onEdit: (server: Server) => void;
}

export function ServerCard({
	server,
	onConnect,
	onUnfavorite,
	onEdit,
}: ServerCardProps) {
	const queryClient = useQueryClient();
	const listenRef = useRef<UnlistenFn>(null);
	const serverAddress = server.port ? `${server.ip}:${server.port}` : server.ip;
	const hasPassword = server.password && server.password.length > 0;
	const { installations } = useInstallations();
	const installation = installations.find(
		(inst) => inst.id === server.installationId,
	);
	const { data: versions } = useInstalledVersions();

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
	if (!installation) return null;

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
				<div className="text-left">
					<p className="font-mono text-sm text-foreground">
						{server.name}
						{hasPassword ? (
							<Lock className="ml-2 inline h-4 w-4 text-muted-foreground" />
						) : null}
					</p>
					{installation.version && (
						<p className="font-mono text-xs text-muted-foreground">
							v{installation.version} - {serverAddress}
						</p>
					)}
				</div>
			</div>
			<div className="flex items-center gap-1">
				<Tooltip>
					{versions.includes(installation.version) ? (
						<>
							<TooltipTrigger asChild>
								<Button
									className="h-8 w-8 text-muted-foreground hover:text-foreground"
									onClick={() => onConnect(server)}
									size="icon"
									variant="ghost"
								>
									<Play className="h-4 w-4" />
									<span className="sr-only">Play {server.name}</span>
								</Button>
							</TooltipTrigger>
							<TooltipContent>Connect to {server.name}</TooltipContent>
						</>
					) : (
						<>
							<TooltipTrigger asChild>
								<Button
									className="h-8 w-8 text-muted-foreground hover:text-foreground"
									disabled={isInstalling}
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
							onClick={() => onEdit(server)}
							size="icon"
							variant="ghost"
						>
							<Pencil className="h-4 w-4" />
							<span className="sr-only">Edit {server.name}</span>
						</Button>
					</TooltipTrigger>
					<TooltipContent>Edit {server.name}</TooltipContent>
				</Tooltip>
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							className={cn(
								"h-8 w-8",
								server.favorite
									? "text-warning"
									: "hover:text-foreground text-muted-foreground",
							)}
							onClick={() => onUnfavorite(server)}
							size="icon"
							variant="ghost"
						>
							<Star
								className={cn("h-4 w-4", server.favorite && "fill-warning")}
							/>
							<span className="sr-only">
								{server.favorite ? "Unfavorite" : "Favorite"} {server.name}
							</span>
						</Button>
					</TooltipTrigger>
					<TooltipContent>
						{server.favorite ? "Unfavorite" : "Favorite"} {server.name}
					</TooltipContent>
				</Tooltip>
			</div>
		</>
	);
}
