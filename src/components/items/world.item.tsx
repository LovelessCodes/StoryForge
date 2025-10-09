import { useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { formatDistanceToNow } from "date-fns";
import {
	DownloadCloudIcon,
	MapIcon,
	PenIcon,
	PlayIcon,
	SproutIcon,
	TrashIcon,
} from "lucide-react";
import { motion } from "motion/react";
import { useRef } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import { useDownloadVersion } from "@/hooks/use-download-version";
import {
	installedVersionsQueryKey,
	useInstalledVersions,
} from "@/hooks/use-installed-versions";
import type { Save } from "@/hooks/use-saves";
import type { ProgressPayload } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useDialogStore } from "@/stores/dialogs";
import { useInstallations } from "@/stores/installations";

const itemVariants = {
	exit: { opacity: 0, transition: { duration: 0.15 }, y: -4 },
	hidden: { opacity: 0, y: 8 },
	show: (i: number) => ({
		opacity: 1,
		transition: {
			damping: 32,
			delay: i * 0.05, // 50ms incremental stagger based on current index
			stiffness: 420,
			type: "spring" as const,
		},
		y: 0,
	}),
};

export const WorldItem = ({
	world,
	index = 0,
}: {
	world: Save;
	index?: number;
}) => {
	const { installations } = useInstallations();
	const { data: versions } = useInstalledVersions();
	const { openDialog } = useDialogStore();
	const [copiedText, copyToClipboard] = useCopyToClipboard();
	const worldData = world[0];
	const installation = installations.find(
		(installation) => installation.path.split("/").pop() === world[2],
	);
	const version = versions?.find((v) => v === installation?.version);
	const listenRef = useRef<() => void>(null);
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
	if (!installation) return null;
	if (!worldData) return null;
	return (
		<motion.div
			animate="show"
			className="not-last:border-b p-2 flex gap-2 w-full"
			custom={index}
			exit="exit"
			initial="hidden"
			key={worldData.world_name}
			layout="position"
			variants={itemVariants}
		>
			<div className="grid grid-cols-3 justify-between w-full items-center">
				<div className="flex flex-col">
					<p className="text-sm">
						{worldData.world_name}
						<Tooltip>
							<TooltipTrigger
								className={cn([
									"ml-2 text-xs opacity-50 cursor-pointer",
									worldData.seed.toString() === copiedText && "text-green-400",
								])}
								onClick={() => copyToClipboard(worldData.seed.toString())}
							>
								<SproutIcon className="inline h-4 w-4" />
							</TooltipTrigger>
							<TooltipContent className="flex flex-col gap-1 text-center">
								Seed: {worldData.seed}
								{worldData.seed.toString() === copiedText ? (
									<span className="text-green-400">Copied!</span>
								) : (
									<span className="text-muted-foreground text-xs">
										Click to copy
									</span>
								)}
							</TooltipContent>
						</Tooltip>
					</p>
					<p className="text-xs text-muted-foreground">
						by{" "}
						<span className="text-warning-foreground">
							{worldData.created_by_player_name}
						</span>
						<span className="text-muted-foreground">
							{" "}
							in {worldData.created_game_version}
						</span>
					</p>
				</div>
				<div className="flex flex-col">
					<p className="text-sm text-muted-foreground">
						{installation.name}{" "}
						{worldData.last_saved_game_version &&
						worldData.last_saved_game_version !== installation.version ? (
							<Tooltip>
								<TooltipTrigger>
									<span className="text-xs text-warning-foreground opacity-50">
										(Different Version {worldData.last_saved_game_version} →{" "}
										{installation.version})
									</span>
								</TooltipTrigger>
								<TooltipContent>
									The installation version ({installation.version}) is different
									from the world's created version (
									{worldData.created_game_version}) or the last saved version (
									{worldData.last_saved_game_version}).
								</TooltipContent>
							</Tooltip>
						) : (
							<span className="text-xs opacity-50">
								({worldData.created_game_version}
								{worldData.last_saved_game_version !==
								worldData.created_game_version
									? ` → ${worldData.last_saved_game_version}`
									: ""}
								)
							</span>
						)}
					</p>
					<p className="text-xs text-muted-foreground">
						Last played:{" "}
						{worldData.last_played
							? formatDistanceToNow(new Date(worldData.last_played), {
									addSuffix: true,
								})
							: "Never"}
					</p>
				</div>
				<div className="inline-flex justify-end -space-x-px rounded-md shadow-xs rtl:space-x-reverse">
					<Tooltip>
						<TooltipTrigger asChild>
							{version ? (
								<Button
									className="rounded-none shadow-none first:rounded-s-md last:rounded-e-md focus-visible:z-10"
									onClick={() => {
										invoke("play_game", {
											options: {
												installation_id: installation.id,
												save: world[1].split("/").pop()?.replace(".vcdbs", ""),
											},
										});
										toast.success(
											`Launching ${installation.name} on ${worldData.world_name}...`,
										);
									}}
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
								onClick={() => openDialog("ViewMapDialog", { world })}
								variant="outline"
							>
								<MapIcon
									aria-hidden="true"
									className="-ms-1 opacity-60 text-blue-300"
									size={16}
								/>
							</Button>
						</TooltipTrigger>
						<TooltipContent>View Map</TooltipContent>
					</Tooltip>
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								className="rounded-none shadow-none first:rounded-s-md last:rounded-e-md focus-visible:z-10"
								onClick={() => openDialog("EditWorldDialog", { world })}
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
								onClick={() => openDialog("DeleteWorldDialog", { world })}
								size="icon"
								variant="outline"
							>
								<TrashIcon
									aria-hidden="true"
									className="opacity-60"
									size={16}
								/>
							</Button>
						</TooltipTrigger>
						<TooltipContent>Delete</TooltipContent>
					</Tooltip>
				</div>
			</div>
		</motion.div>
	);
};
