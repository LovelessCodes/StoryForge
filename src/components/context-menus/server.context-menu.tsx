import type { ContextMenu as ContextMenuPrimitive } from "@base-ui-components/react/context-menu";
import { useNavigate } from "@tanstack/react-router";
import {
	DownloadCloudIcon,
	FolderOpenIcon,
	PackageOpenIcon,
	PackageSearchIcon,
	PenIcon,
	PlugIcon,
	StarIcon,
	TrashIcon,
} from "lucide-react";
import { motion } from "motion/react";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { useConnectToServer } from "@/hooks/use-connect-to-server";
import { useDownloadVersion } from "@/hooks/use-download-version";
import { useInstalledVersions } from "@/hooks/use-installed-versions";
import { useRevealInFolder } from "@/hooks/use-reveal-in-folder";
import { cn } from "@/lib/utils";
import { useDialogStore } from "@/stores/dialogs";
import { useInstallations } from "@/stores/installations";
import { type Server, useServerStore } from "@/stores/servers";

export const ServerContextMenu = ({
	server,
	...props
}: ContextMenuPrimitive.Trigger.Props & {
	server: Server;
}) => {
	const navigate = useNavigate();

	// Stores
	const { toggleFavorite } = useServerStore();
	const { openDialog } = useDialogStore();
	const { installations } = useInstallations();
	const installation = installations.find(
		(inst) => inst.id === server.installationId,
	);

	// Mutations
	const { mutate: revealInstallationInFolder } = useRevealInFolder();
	const { mutate: connectToServer } = useConnectToServer();
	const { mutate: downloadVersion } = useDownloadVersion();

	// Queries
	const { data: installedVersions } = useInstalledVersions();

	return (
		<ContextMenu>
			<ContextMenuTrigger {...props} />
			<ContextMenuContent>
				{installation && installedVersions?.includes(installation.version) ? (
					<ContextMenuItem
						className="flex items-center justify-between gap-4"
						onClick={() => connectToServer(server)}
					>
						Connect
						<PlugIcon className="inline-block h-4 w-4" />
					</ContextMenuItem>
				) : (
					<ContextMenuItem
						className="flex items-center justify-between gap-4"
						onClick={() =>
							installation && downloadVersion(installation.version)
						}
					>
						Download {installation?.version}
						<DownloadCloudIcon className="inline-block h-4 w-4" />
					</ContextMenuItem>
				)}
				<ContextMenuItem
					className="flex items-center justify-between gap-4"
					onClick={() => toggleFavorite(server.id)}
				>
					{server.favorite ? "Unfavorite" : "Favorite"}
					<StarIcon
						className={cn(
							"inline-block h-4 w-4",
							server.favorite && "text-warning fill-warning",
						)}
					/>
				</ContextMenuItem>
				<ContextMenuItem
					className="flex items-center justify-between gap-4"
					onClick={() =>
						installation &&
						navigate({
							params: { id: installation?.id.toString() },
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
						installation &&
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
					onClick={() =>
						installation && revealInstallationInFolder(installation.path)
					}
				>
					Open Installation Folder
					<FolderOpenIcon className="inline-block h-4 w-4" />
				</ContextMenuItem>
				<ContextMenuItem
					className="flex items-center justify-between gap-4"
					onClick={() => openDialog("EditServerDialog", { server })}
				>
					Edit
					<PenIcon className="inline-block h-4 w-4" />
				</ContextMenuItem>
				<ContextMenuItem
					className="flex items-center justify-between gap-4"
					onClick={() => openDialog("DeleteServerDialog", { server })}
					variant="destructive"
				>
					Delete
					<TrashIcon className="inline-block h-4 w-4" />
				</ContextMenuItem>
			</ContextMenuContent>
		</ContextMenu>
	);
};

export const MotionServerContextMenu = motion.create(ServerContextMenu);
