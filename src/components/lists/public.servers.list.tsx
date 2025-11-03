import { measureElement, useVirtualizer } from "@tanstack/react-virtual";
import {
	DownloadCloudIcon,
	FolderPlusIcon,
	ListCheckIcon,
	LockIcon,
	PlugIcon,
	Users2Icon,
} from "lucide-react";
import { useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { useDownloadVersion } from "@/hooks/use-download-version";
import { useInstalledVersions } from "@/hooks/use-installed-versions";
import type { PublicServer } from "@/hooks/use-public-servers";
import { useDialogStore } from "@/stores/dialogs";
import { useInstallations } from "@/stores/installations";
import { useServersFilters } from "@/stores/serversFilters";
import { MotionPublicServerContextMenu } from "../context-menus/public-server.context-menu";

export function PublicServerList({
	parentRef,
	publicServers,
}: {
	parentRef: React.RefObject<HTMLDivElement | null>;
	publicServers: PublicServer[];
}) {
	const { data: installedVersions } = useInstalledVersions();
	const { installations } = useInstallations();
	const { openDialog } = useDialogStore();
	const { mutate: downloadVersion } = useDownloadVersion();
	const { searchText, selectedGameVersions, sortBy, orderDirection } =
		useServersFilters();

	const filteredServers = publicServers
		.filter((server) =>
			searchText.length > 1
				? server.serverName.toLowerCase().includes(searchText.toLowerCase()) ||
					server.gameDescription
						.toLowerCase()
						.includes(searchText.toLowerCase()) ||
					server.serverIP.toLowerCase().includes(searchText.toLowerCase())
				: true,
		)
		.filter((server) =>
			selectedGameVersions.length > 0
				? selectedGameVersions.includes(server.gameVersion)
				: true,
		)
		.sort((a, b) => {
			if (sortBy === "name") {
				if (orderDirection === "descending") {
					return b.serverName.localeCompare(a.serverName);
				}
				return a.serverName.localeCompare(b.serverName);
			}
			if (sortBy === "maxplayers") {
				const bMaxPlayers = Number(b.maxPlayers);
				const aMaxPlayers = Number(a.maxPlayers);
				if (orderDirection === "descending") {
					return bMaxPlayers - aMaxPlayers;
				}
				return aMaxPlayers - bMaxPlayers;
			}
			if (sortBy === "mods") {
				if (orderDirection === "descending") {
					return b.mods.length - a.mods.length;
				}
				return a.mods.length - b.mods.length;
			}
			if (sortBy === "version") {
				if (orderDirection === "descending") {
					return b.gameVersion.localeCompare(a.gameVersion);
				}
				return a.gameVersion.localeCompare(b.gameVersion);
			}
			if (sortBy === "whitelist") {
				if (orderDirection === "descending") {
					return Number(b.whitelisted) - Number(a.whitelisted);
				}
				return Number(a.whitelisted) - Number(b.whitelisted);
			}
			if (orderDirection === "descending") {
				return a.players - b.players;
			}
			return b.players - a.players;
		});

	const estimateSize = useCallback(() => 81, []);

	const rowVirtualizer = useVirtualizer({
		count: filteredServers?.length || 0,
		estimateSize,
		getScrollElement: () => parentRef.current,
		measureElement,
		overscan: 20,
	});

	const items = rowVirtualizer.getVirtualItems();
	const totalSize = rowVirtualizer.getTotalSize();

	return (
		<div
			className="relative"
			style={{
				height: totalSize,
			}}
		>
			{filteredServers &&
				items.map((item) => {
					const server = filteredServers[item.index];
					if (!server) return null;
					return (
						<div
							className="not-last:border-b p-2 flex gap-2 absolute top-0 left-0 w-full"
							data-index={item.index}
							key={item.index}
							ref={rowVirtualizer.measureElement}
							style={{
								transform: `translateY(${item.start}px)`,
								willChange: "transform",
							}}
						>
							<MotionPublicServerContextMenu
								animate={{ opacity: 1, y: 0 }}
								className="flex flex-row justify-between w-full items-center gap-4"
								exit={{ opacity: 0, y: 20 }}
								initial={{ opacity: 0, y: 20 }}
								server={server}
							>
								<div className="flex flex-col">
									<div className="flex gap-1 items-center font-semibold">
										{server?.serverName}
									</div>
									<p className="text-xs">{server?.serverIP}</p>
									<p className="text-sm text-muted-foreground line-clamp-1 break-all">
										{server?.gameDescription.replace(/<\/?[^>]+(>|$)/g, "")}
									</p>
									<div className="flex gap-2 items-center text-xs text-muted-foreground mt-1">
										<Badge
											className={
												installedVersions.includes(server?.gameVersion)
													? "text-emerald-700"
													: "text-red-900"
											}
											variant="outline"
										>
											Version: {server?.gameVersion}
										</Badge>
										<Badge className="text-muted-foreground" variant="outline">
											{server?.players}/{server?.maxPlayers}{" "}
											<Users2Icon className="size-4 inline-block ml-1" />
										</Badge>
										{server.mods.length > 0 && (
											<Badge
												className="text-muted-foreground"
												variant="outline"
											>
												Mods: {server?.mods.length}
											</Badge>
										)}
										{server?.whitelisted && (
											<Badge
												className="text-muted-foreground"
												variant="outline"
											>
												Whitelisted
												<ListCheckIcon className="size-4 inline-block ml-1" />
											</Badge>
										)}
										{server?.hasPassword && (
											<Badge
												className="text-muted-foreground"
												variant="outline"
											>
												Protected
												<LockIcon className="size-4 inline-block ml-1" />
											</Badge>
										)}
									</div>
								</div>
								{installedVersions.includes(server.gameVersion) ? (
									<Tooltip>
										<TooltipTrigger
											render={
												<Button
													aria-label="Connect to server"
													className="shadow-none focus-visible:z-10"
													onClick={() =>
														openDialog("ConnectServerDialog", { server })
													}
													size="icon"
													variant="outline"
												/>
											}
										>
											<PlugIcon
												aria-hidden="true"
												className="opacity-60 text-success"
												size={16}
											/>
										</TooltipTrigger>
										<TooltipContent>
											Connect to {server?.serverName}
										</TooltipContent>
									</Tooltip>
								) : installations.find(
										(i) => i.version === server.gameVersion,
									) ? (
									<Tooltip>
										<TooltipTrigger
											render={
												<Button
													aria-label="Connect to server"
													className="shadow-none focus-visible:z-10"
													onClick={() => downloadVersion(server.gameVersion)}
													size="icon"
													variant="outline"
												/>
											}
										>
											<DownloadCloudIcon
												aria-hidden="true"
												className="-ms-1 opacity-60 text-warning-foreground"
												size={16}
											/>
										</TooltipTrigger>
										<TooltipContent>
											Download {server?.gameVersion}
										</TooltipContent>
									</Tooltip>
								) : (
									<Tooltip>
										<TooltipTrigger
											render={
												<Button
													aria-label="Install version"
													className="shadow-none focus-visible:z-10"
													onClick={() =>
														openDialog("AddInstallationDialog", {
															version: server.gameVersion,
														})
													}
													size="icon"
													variant="outline"
												/>
											}
										>
											<FolderPlusIcon
												aria-hidden="true"
												className="opacity-60"
												size={16}
											/>
										</TooltipTrigger>
										<TooltipContent>
											Add installation for {server?.gameVersion}
										</TooltipContent>
									</Tooltip>
								)}
							</MotionPublicServerContextMenu>
						</div>
					);
				})}
		</div>
	);
}
