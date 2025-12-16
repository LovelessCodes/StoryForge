import { formatDistanceToNow } from "date-fns";
import {
	DownloadCloudIcon,
	PackagePlusIcon,
	Pencil,
	Play,
	Star,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Group, GroupItem } from "@/components/ui/group";
import {
	Tooltip,
	TooltipContent,
	TooltipCreateHandle,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { useDownloadVersion } from "@/hooks/use-download-version";
import { useInstalledVersions } from "@/hooks/use-installed-versions";
import { cn } from "@/lib/utils";
import type { Installation } from "@/stores/installations";

interface InstallationCardProps {
	installation: Installation;
	onPlay: (installation: Installation) => void;
	onUnfavorite: (installation: Installation) => void;
	onEdit: (installation: Installation) => void;
	onAddMods: (installation: Installation) => void;
}

const tooltipHandle = TooltipCreateHandle();

export function InstallationCard({
	installation,
	onPlay,
	onUnfavorite,
	onEdit,
	onAddMods,
}: InstallationCardProps) {
	const { mutate: installVersion, isPending: isInstalling } =
		useDownloadVersion();

	const { data: versions } = useInstalledVersions();
	return (
		<>
			<div className="flex items-center gap-3">
				<div
					className={`h-2 w-2 rounded-full ${
						versions.includes(installation.version)
							? "bg-success"
							: "bg-muted-foreground/40"
					}`}
				/>
				<TooltipTrigger
					className="flex flex-col justify-start text-left"
					handle={tooltipHandle}
					payload={() => (
						<>
							Last played:{" "}
							{installation.lastTimePlayed
								? formatDistanceToNow(new Date(installation.lastTimePlayed), {
										addSuffix: true,
									})
								: "Never"}
						</>
					)}
				>
					<p className="font-mono text-sm text-foreground">
						{installation.name}
					</p>
					{installation.version && (
						<p className="font-mono text-xs text-muted-foreground">
							v{installation.version}
						</p>
					)}
				</TooltipTrigger>
			</div>
			<Group>
				{versions.includes(installation.version) ? (
					<TooltipTrigger
						handle={tooltipHandle}
						payload={() => `Play ${installation.name}`}
						render={
							<GroupItem
								render={
									<Button
										className="h-8 w-8 text-muted-foreground hover:text-foreground"
										onClick={() => onPlay(installation)}
										size="icon"
										variant="ghost"
									/>
								}
							>
								<Play className="h-4 w-4" />
								<span className="sr-only">Play {installation.name}</span>
							</GroupItem>
						}
					/>
				) : (
					<TooltipTrigger
						handle={tooltipHandle}
						payload={() => `Download version ${installation.version}`}
						render={
							<GroupItem
								render={
									<Button
										className="h-8 w-8 text-muted-foreground hover:text-foreground"
										disabled={isInstalling}
										onClick={() => installVersion(installation.version)}
										size="icon"
										variant="ghost"
									/>
								}
							>
								<DownloadCloudIcon className="h-4 w-4" />
								<span className="sr-only">
									Download version {installation.version}
								</span>
							</GroupItem>
						}
					/>
				)}
				<TooltipTrigger
					handle={tooltipHandle}
					payload={() => `Add mods to ${installation.name}`}
					render={
						<GroupItem
							render={
								<Button
									className="h-8 w-8 text-muted-foreground hover:text-foreground"
									onClick={() => onAddMods(installation)}
									size="icon"
									variant="ghost"
								/>
							}
						>
							<PackagePlusIcon className="h-4 w-4" />
							<span className="sr-only">Add mods to {installation.name}</span>
						</GroupItem>
					}
				/>
				<TooltipTrigger
					handle={tooltipHandle}
					payload={() => `Edit ${installation.name}`}
					render={
						<GroupItem
							render={
								<Button
									className="h-8 w-8 text-muted-foreground hover:text-foreground"
									onClick={() => onEdit(installation)}
									size="icon"
									variant="ghost"
								/>
							}
						>
							<Pencil className="h-4 w-4" />
							<span className="sr-only">Edit {installation.name}</span>
						</GroupItem>
					}
				/>
				<TooltipTrigger
					handle={tooltipHandle}
					payload={() => (installation.favorite ? "Unfavorite" : "Favorite")}
					render={
						<GroupItem
							render={
								<Button
									className={cn(
										"h-8 w-8",
										installation.favorite
											? "text-warning"
											: "hover:text-foreground text-muted-foreground",
									)}
									onClick={() => onUnfavorite(installation)}
									size="icon"
									variant="ghost"
								/>
							}
						>
							<Star
								className={cn(
									"h-4 w-4",
									installation.favorite && "fill-warning",
								)}
							/>
							<span className="sr-only">
								{installation.favorite ? "Unfavorite" : "Favorite"}{" "}
								{installation.name}
							</span>
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
		</>
	);
}
