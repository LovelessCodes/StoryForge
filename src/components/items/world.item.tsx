import { useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { DownloadCloudIcon, PlayIcon } from "lucide-react";
import { useRef } from "react";
import { toast } from "sonner";
import { useDownloadVersion } from "@/hooks/use-download-version";
import {
	installedVersionsQueryKey,
	useInstalledVersions,
} from "@/hooks/use-installed-versions";
import type { ProgressPayload } from "@/lib/types";
import { useInstallations } from "@/stores/installations";
import { Button } from "../ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";

export const WorldItem = ({ world }: { world: [string, string] }) => {
	const { installations } = useInstallations();
	const { data: versions } = useInstalledVersions();
	const installation = installations.find(
		(installation) => installation.path.split("/").pop() === world[1],
	);
	const version = versions?.find((v) => v === installation?.version);
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
	if (!installation) return null;
	return (
		<div
			className="border-b border-b-muted p-2 flex gap-2 w-full"
			key={world[0]}
		>
			<div className="grid grid-cols-3 justify-between w-full items-center">
				<p>{world[0]}</p>
				<p className="text-sm text-muted-foreground">{installation.name}</p>
				<div className="inline-flex justify-end -space-x-px rounded-md shadow-xs rtl:space-x-reverse">
					<Tooltip>
						<TooltipTrigger asChild>
							{version ? (
								<Button
									className="rounded-none shadow-none first:rounded-s-md last:rounded-e-md focus-visible:z-10"
									onClick={() => {
										invoke("play_game", {
											installation_id: installation.id,
											save: world[0],
										});
										toast.success(
											`Launching ${installation.name} on ${world[0]}...`,
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
				</div>
			</div>
		</div>
	);
};
