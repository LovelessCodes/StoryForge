import type { ContextMenu as ContextMenuPrimitive } from "@base-ui/react/context-menu";
import { useNavigate } from "@tanstack/react-router";
import {
	DownloadCloudIcon,
	DownloadIcon,
	FileUpIcon,
	FolderOpenIcon,
	FolderPenIcon,
	FolderXIcon,
	PackageOpenIcon,
	PackageSearchIcon,
	PlayIcon,
	StarIcon,
} from "lucide-react";
import { motion } from "motion/react";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuGroup,
	ContextMenuItem,
	ContextMenuLabel,
	ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { useDownloadVersion } from "@/hooks/use-download-version";
import { useInstalledVersions } from "@/hooks/use-installed-versions";
import { usePlayInstallation } from "@/hooks/use-play-installation";
import { useRevealInFolder } from "@/hooks/use-reveal-in-folder";
import { cn, exportInstallation, exportInstallationToFile } from "@/lib/utils";
import { useDialogStore } from "@/stores/dialogs";
import { type Installation, useInstallations } from "@/stores/installations";

export const InstallationContextMenu = ({
	installation,
	...props
}: ContextMenuPrimitive.Trigger.Props & {
	installation: Installation;
}) => {
	const navigate = useNavigate();

	// Stores
	const { toggleFavorite } = useInstallations();
	const { openDialog } = useDialogStore();

	// Mutations
	const { mutate: revealInstallationInFolder } = useRevealInFolder();
	const { mutate: launchInstallation } = usePlayInstallation();
	const { mutate: downloadVersion } = useDownloadVersion();

	// Queries
	const { data: installedVersions } = useInstalledVersions();

	return (
		<ContextMenu>
			<ContextMenuTrigger {...props} />
			<ContextMenuContent>
				<ContextMenuGroup>
					<ContextMenuLabel className="text-xs border-b text-muted-foreground/50 font-semibold">
						{installation.name}
					</ContextMenuLabel>
					{installedVersions?.includes(installation.version) ? (
						<ContextMenuItem
							className="flex items-center justify-between gap-4"
							onClick={() => launchInstallation({ id: installation.id })}
						>
							Launch
							<PlayIcon className="inline-block h-4 w-4" />
						</ContextMenuItem>
					) : (
						<ContextMenuItem
							className="flex items-center justify-between gap-4"
							onClick={() => downloadVersion(installation.version)}
						>
							Download {installation.version}
							<DownloadCloudIcon className="inline-block h-4 w-4" />
						</ContextMenuItem>
					)}
					<ContextMenuItem
						className="flex items-center justify-between gap-4"
						onClick={() => toggleFavorite(installation.id)}
					>
						{installation.favorite ? "Unfavorite" : "Favorite"}
						<StarIcon
							className={cn(
								"inline-block h-4 w-4",
								installation.favorite && "text-warning fill-warning",
							)}
						/>
					</ContextMenuItem>
					<ContextMenuItem
						className="flex items-center justify-between gap-4"
						onClick={() =>
							navigate({
								params: { id: installation.id.toString() },
								to: "/install-mods/$id",
							})
						}
					>
						Manage Mods
						<PackageSearchIcon className="inline-block h-4 w-4" />
					</ContextMenuItem>
					<ContextMenuItem
						className="flex items-center justify-between gap-4"
						onClick={() =>
							navigate({
								params: { id: installation.id.toString() },
								to: "/mod-configs/$id",
							})
						}
					>
						Configure Mods
						<PackageOpenIcon className="inline-block h-4 w-4" />
					</ContextMenuItem>
					<ContextMenuItem
						className="flex items-center justify-between gap-4"
						onClick={() => revealInstallationInFolder(installation.path)}
					>
						Open Folder
						<FolderOpenIcon className="inline-block h-4 w-4" />
					</ContextMenuItem>
					<ContextMenuItem
						className="flex items-center justify-between gap-4"
						onClick={() => exportInstallation({ installation })}
					>
						Export
						<FileUpIcon className="inline-block h-4 w-4" />
					</ContextMenuItem>
					<ContextMenuItem
						className="flex items-center justify-between gap-4"
						onClick={() => exportInstallationToFile({ installation })}
					>
						Export to file
						<DownloadIcon className="inline-block h-4 w-4" />
					</ContextMenuItem>
					<ContextMenuItem
						className="flex items-center justify-between gap-4"
						onClick={() =>
							openDialog("EditInstallationDialog", { installation })
						}
					>
						Edit
						<FolderPenIcon className="inline-block h-4 w-4" />
					</ContextMenuItem>
					<ContextMenuItem
						className="flex items-center justify-between gap-4"
						onClick={() =>
							openDialog("DeleteInstallationDialog", { installation })
						}
						variant="destructive"
					>
						Delete
						<FolderXIcon className="inline-block h-4 w-4" />
					</ContextMenuItem>
				</ContextMenuGroup>
			</ContextMenuContent>
		</ContextMenu>
	);
};

export const MotionInstallationContextMenu = motion.create(
	InstallationContextMenu,
);
