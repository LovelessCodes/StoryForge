import { measureElement, useVirtualizer } from "@tanstack/react-virtual";
import {
  DownloadCloudIcon,
  FolderPlusIcon,
  ListCheckIcon,
  LockIcon,
  PlugIcon,
  Users2Icon,
} from "lucide-react";
import { useCallback, useEffect } from "react";

import { MotionPublicServerContextMenu } from "@/components/context-menus/public-server.context-menu";
import { ConnectServerDialog } from "@/components/dialogs/connectserver.dialog";
import { InstallationDialog } from "@/components/dialogs/installation.dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DialogTrigger } from "@/components/ui/dialog";
import { TooltipTrigger } from "@/components/ui/tooltip";
import { rootDialogHandle, rootTooltipHandle } from "@/handles";
import { useDownloadVersion } from "@/hooks/use-download-version";
import { useInstalledVersionNames } from "@/hooks/use-installed-versions";
import type { PublicServer } from "@/hooks/use-public-servers";
import { compareSemverAsc, compareSemverDesc, stripped } from "@/lib/utils";
import { useInstallations } from "@/stores/installations";
import { useServersFilters } from "@/stores/serversFilters";

export function PublicServerList({
  scrollElement,
  publicServers,
}: {
  scrollElement: HTMLDivElement | null;
  publicServers: PublicServer[];
}) {
  const installedVersions = useInstalledVersionNames();
  const { installations } = useInstallations();
  const { mutate: downloadVersion } = useDownloadVersion();
  const { searchText, selectedGameVersions, sortBy, orderDirection } = useServersFilters();

  const filteredServers = publicServers
    .filter((server) => {
      const matchesSearch =
        searchText.length <= 1 ||
        server.serverName.toLowerCase().includes(searchText.toLowerCase()) ||
        server.gameDescription.toLowerCase().includes(searchText.toLowerCase()) ||
        server.serverIP.toLowerCase().includes(searchText.toLowerCase());
      const matchesVersion =
        selectedGameVersions.length === 0 || selectedGameVersions.includes(server.gameVersion);
      return matchesSearch && matchesVersion;
    })
    .sort((a, b) => {
      if (sortBy === "name") {
        if (orderDirection === "descending") {
          return stripped(b.serverName).localeCompare(stripped(a.serverName));
        }
        return stripped(a.serverName).localeCompare(stripped(b.serverName));
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
          return compareSemverDesc(b.gameVersion, a.gameVersion);
        }
        return compareSemverAsc(a.gameVersion, b.gameVersion);
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
    getScrollElement: () => scrollElement,
    measureElement,
    overscan: 5,
  });

  useEffect(() => {
    if (scrollElement) {
      rowVirtualizer.measure();
    }
  }, [scrollElement, rowVirtualizer]);

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
              className="absolute top-0 left-0 flex w-full gap-2 p-2 not-last:border-b"
              data-index={item.index}
              key={item.index}
              ref={rowVirtualizer.measureElement}
              style={{
                transform: `translateY(${item.start}px)`,
              }}
            >
              <MotionPublicServerContextMenu
                animate={{ opacity: 1, y: 0 }}
                className="flex w-full flex-row items-center justify-between gap-4"
                exit={{ opacity: 0, y: 20 }}
                initial={{ opacity: 0, y: 20 }}
                server={server}
              >
                <div className="flex flex-col">
                  <div className="flex items-center gap-1 font-semibold">{server?.serverName}</div>
                  <p className="text-xs">{server?.serverIP}</p>
                  <p className="text-muted-foreground line-clamp-1 text-sm break-all">
                    {server?.gameDescription.replace(/<\/?[^>]+(>|$)/g, "")}
                  </p>
                  <div className="text-muted-foreground mt-1 flex items-center gap-2 text-xs">
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
                      <Users2Icon className="ml-1 inline-block size-4" />
                    </Badge>
                    {server.mods.length > 0 && (
                      <Badge className="text-muted-foreground" variant="outline">
                        Mods: {server?.mods.length}
                      </Badge>
                    )}
                    {server?.whitelisted && (
                      <Badge className="text-muted-foreground" variant="outline">
                        Whitelisted
                        <ListCheckIcon className="ml-1 inline-block size-4" />
                      </Badge>
                    )}
                    {server?.hasPassword && (
                      <Badge className="text-muted-foreground" variant="outline">
                        Protected
                        <LockIcon className="ml-1 inline-block size-4" />
                      </Badge>
                    )}
                  </div>
                </div>
                {installedVersions.includes(server.gameVersion) ? (
                  <TooltipTrigger
                    render={
                      <Button
                        aria-label="Connect to server"
                        className="shadow-none focus-visible:z-10"
                        render={
                          <DialogTrigger
                            handle={rootDialogHandle}
                            payload={() => <ConnectServerDialog server={server} />}
                          />
                        }
                        size="icon"
                        variant="outline"
                      />
                    }
                    handle={rootTooltipHandle}
                    payload={() => `Connect to ${server?.serverName}`}
                  >
                    <PlugIcon aria-hidden="true" className="text-success opacity-60" size={16} />
                  </TooltipTrigger>
                ) : installations.find((i) => i.version === server.gameVersion) ? (
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
                    handle={rootTooltipHandle}
                    payload={() => `Download ${server?.gameVersion}`}
                  >
                    <DownloadCloudIcon
                      aria-hidden="true"
                      className="text-warning-foreground -ms-1 opacity-60"
                      size={16}
                    />
                  </TooltipTrigger>
                ) : (
                  <TooltipTrigger
                    render={
                      <Button
                        aria-label="Install version"
                        className="shadow-none focus-visible:z-10"
                        render={
                          <DialogTrigger
                            handle={rootDialogHandle}
                            payload={() => <InstallationDialog version={server.gameVersion} />}
                          />
                        }
                        size="icon"
                        variant="outline"
                      />
                    }
                    handle={rootTooltipHandle}
                    payload={() => `Add installation for ${server?.gameVersion}`}
                  >
                    <FolderPlusIcon aria-hidden="true" className="opacity-60" size={16} />
                  </TooltipTrigger>
                )}
              </MotionPublicServerContextMenu>
            </div>
          );
        })}
    </div>
  );
}
