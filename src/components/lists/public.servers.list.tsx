import { measureElement, useVirtualizer } from "@tanstack/react-virtual";
import { ListCheckIcon, LockIcon, Users2Icon } from "lucide-react";
import { useCallback } from "react";
import { useInstalledVersions } from "@/hooks/use-installed-versions";
import { usePublicServers } from "@/hooks/use-public-servers";
import { useServersFilters } from "@/stores/serversFilters";
import { ConnectServerDialog } from "../dialogs/connectserver.dialog";
import { Badge } from "../ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";

export function PublicServerList({
	parentRef,
}: {
	parentRef: React.RefObject<HTMLDivElement | null>;
}) {
	const { data: publicServers } = usePublicServers();
	const { data: installedVersions } = useInstalledVersions();
	const { searchText, selectedGameVersions, sortBy, orderDirection } =
		useServersFilters();

	const filteredServers = publicServers?.data
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
					return (
						<div
							className="border-b border-b-muted p-2 flex gap-2 absolute top-0 left-0 w-full"
							data-index={item.index}
							key={item.index}
							ref={rowVirtualizer.measureElement}
							style={{
								transform: `translateY(${item.start}px)`,
								willChange: "transform",
							}}
						>
							<div className="flex flex-row justify-between w-full items-center">
								<div className="flex flex-col">
									<div className="flex gap-1 items-center font-semibold">
										{server?.serverName}
									</div>
									<p className="text-xs">{server?.serverIP}</p>
									<p className="text-sm text-muted-foreground line-clamp-1 break-all">
										{server?.gameDescription}
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
							</div>
							<div className="flex gap-2 items-center">
								<Tooltip>
									<TooltipTrigger asChild>
										<ConnectServerDialog server={server} />
									</TooltipTrigger>
									<TooltipContent>Connect to {server?.serverIP}</TooltipContent>
								</Tooltip>
							</div>
						</div>
					);
				})}
		</div>
	);
}
