import { invoke } from "@tauri-apps/api/core";
import { formatDistanceToNow } from "date-fns";
import {
	DownloadCloudIcon,
	MapIcon,
	PenIcon,
	PlayIcon,
	SproutIcon,
	TrashIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Group, GroupItem, GroupSeparator } from "@/components/ui/group";
import {
	Tooltip,
	TooltipContent,
	TooltipCreateHandle,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import { useDownloadVersion } from "@/hooks/use-download-version";
import { useInstalledVersions } from "@/hooks/use-installed-versions";
import type { World } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useDialogStore } from "@/stores/dialogs";
import { useInstallations } from "@/stores/installations";

const tooltipHandle = TooltipCreateHandle();

export const WorldItem = ({ world }: { world: World }) => {
	const { installations } = useInstallations();
	const { data: versions } = useInstalledVersions();
	const { openDialog } = useDialogStore();
	const [copiedText, copyToClipboard] = useCopyToClipboard();
	const worldData = world.data;
	const installation = installations.find(
		(installation) =>
			installation.path.split("/").pop() === world.installation_name,
	);
	const version = versions?.find((v) => v === installation?.version);
	const { mutate: installVersion, isPending: isInstalling } =
		useDownloadVersion();
	if (!installation) return null;
	if (!worldData) return null;
	return (
		<div className="grid grid-cols-3 justify-between w-full items-center">
			<div className="flex flex-col">
				<p className="text-sm">
					{worldData.world_name}
					<TooltipTrigger
						className={cn([
							"ml-2 text-xs opacity-50 cursor-pointer",
							worldData.seed.toString() === copiedText && "text-success",
						])}
						handle={tooltipHandle}
						onClick={() => copyToClipboard(worldData.seed.toString())}
						payload={() => (
							<>
								Seed: {worldData.seed}
								{worldData.seed.toString() === copiedText ? (
									<span className="text-success">Copied!</span>
								) : (
									<span className="text-muted-foreground text-xs">
										Click to copy
									</span>
								)}
							</>
						)}
					>
						<SproutIcon className="inline h-4 w-4" />
					</TooltipTrigger>
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
						<TooltipTrigger
							handle={tooltipHandle}
							payload={() => (
								<>
									The installation version ({installation.version}) is different
									from the world's created version (
									{worldData.created_game_version}) or the last saved version (
									{worldData.last_saved_game_version}).
								</>
							)}
						>
							<span className="text-xs text-warning-foreground opacity-50">
								(Different Version {worldData.last_saved_game_version} →{" "}
								{installation.version})
							</span>
						</TooltipTrigger>
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
			<Group className="justify-end w-full">
				<TooltipTrigger
					handle={tooltipHandle}
					payload={() => (version ? "Play" : `Install ${installation.version}`)}
					render={
						<GroupItem
							render={
								<Button
									disabled={isInstalling}
									onClick={() => {
										if (version) {
											invoke("play_game", {
												options: {
													installation_id: installation.id,
													save: world.path
														.split("/")
														.pop()
														?.replace(".vcdbs", ""),
												},
											});
											toast.success(
												`Launching ${installation.name} on ${worldData.world_name}...`,
											);
										} else {
											installVersion(installation.version);
										}
									}}
									variant="outline"
								/>
							}
						>
							{version ? (
								<PlayIcon
									aria-hidden="true"
									className="-ms-1 opacity-60 text-success"
									size={16}
								/>
							) : (
								<DownloadCloudIcon
									aria-hidden="true"
									className="-ms-1 opacity-60 text-warning-foreground"
									size={16}
								/>
							)}
						</GroupItem>
					}
				/>
				<TooltipTrigger
					handle={tooltipHandle}
					payload={() =>
						world.has_map
							? "View Map"
							: `No Map Available for ${worldData.world_name}`
					}
					render={
						<GroupItem
							render={
								<Button
									disabled={!world.has_map}
									onClick={() => openDialog("ViewMapDialog", { world })}
									variant="outline"
								/>
							}
						>
							<MapIcon
								aria-hidden="true"
								className={cn(
									"-ms-1 opacity-60",
									!world.has_map ? "text-destructive" : "text-blue-300",
								)}
								size={16}
							/>
						</GroupItem>
					}
				/>
				<TooltipTrigger
					handle={tooltipHandle}
					payload={() => "Edit World"}
					render={
						<GroupItem
							render={
								<Button
									onClick={() => openDialog("EditWorldDialog", { world })}
									variant="outline"
								/>
							}
						>
							<PenIcon
								aria-hidden="true"
								className="-ms-1 opacity-60"
								size={16}
							/>
						</GroupItem>
					}
				/>
				<GroupSeparator />
				<TooltipTrigger
					handle={tooltipHandle}
					payload={() => "Delete World"}
					render={
						<GroupItem
							render={
								<Button
									aria-label="Delete"
									onClick={() => openDialog("DeleteWorldDialog", { world })}
									size="icon"
									variant="outline"
								/>
							}
						>
							<TrashIcon aria-hidden="true" className="opacity-60" size={16} />
						</GroupItem>
					}
				/>
				<Tooltip handle={tooltipHandle}>
					{({ payload: Payload }) =>
						Payload ? (
							<TooltipContent>
								<Payload />
							</TooltipContent>
						) : null
					}
				</Tooltip>
			</Group>
		</div>
	);
};
