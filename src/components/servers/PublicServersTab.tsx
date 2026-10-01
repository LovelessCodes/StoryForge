import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
  ArrowDownNarrowWide,
  ArrowUpNarrowWide,
  DownloadCloud,
  FolderPlus,
  ListCheck,
  Loader2,
  Lock,
  Plug,
  Search,
  Users2,
} from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDownloadVersion } from "@/hooks/use-download-version";
import { useInstalledVersionNames } from "@/hooks/use-installed-versions";
import type { PublicServer } from "@/hooks/use-public-servers";
import { usePublicServers } from "@/hooks/use-public-servers";
import { compareSemverAsc, compareSemverDesc, stripped } from "@/lib/helpers";
import { gameVersionsQuery } from "@/lib/queries";
import { useProfiles } from "@/stores/profiles";
import { useServersFilters, type ServersFilters } from "@/stores/serversFilters";

import PublicServerConnectSheet from "./PublicServerConnectSheet";

const sortOptions: Record<ServersFilters["sortBy"], string> = {
  maxplayers: "Max Players",
  mods: "Mods",
  name: "Name",
  players: "Players",
  version: "Version",
  whitelist: "Whitelist",
};

export default function PublicServersTab() {
  const navigate = useNavigate();
  const {
    searchText,
    setSearchText,
    selectedGameVersions,
    addGameVersion,
    removeGameVersion,
    sortBy,
    setSortBy,
    orderDirection,
    setOrderDirection,
  } = useServersFilters();
  const { data: gameVersions } = useQuery(gameVersionsQuery);
  const { data: publicServers, isPending } = usePublicServers();
  const installedVersions = useInstalledVersionNames();
  const installedVersionsSet = new Set(installedVersions);
  const { profiles } = useProfiles();
  const downloadVersion = useDownloadVersion();
  const [connectServer, setConnectServer] = useState<PublicServer | null>(null);

  const selectedGameVersionsSet = new Set(selectedGameVersions);

  function syncGameVersions(values: string[]) {
    for (const value of values) {
      if (!selectedGameVersionsSet.has(value)) addGameVersion(value);
    }
    for (const value of selectedGameVersions) {
      if (!values.includes(value)) removeGameVersion(value);
    }
  }

  const filteredServers = (publicServers?.data ?? [])
    .filter((server) => {
      const matchesSearch =
        searchText.length <= 1 ||
        server.serverName.toLowerCase().includes(searchText.toLowerCase()) ||
        server.gameDescription.toLowerCase().includes(searchText.toLowerCase()) ||
        server.serverIP.toLowerCase().includes(searchText.toLowerCase());
      const matchesVersion =
        selectedGameVersions.length === 0 || selectedGameVersionsSet.has(server.gameVersion);
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
        if (orderDirection === "descending") return bMaxPlayers - aMaxPlayers;
        return aMaxPlayers - bMaxPlayers;
      }
      if (sortBy === "mods") {
        if (orderDirection === "descending") return b.mods.length - a.mods.length;
        return a.mods.length - b.mods.length;
      }
      if (sortBy === "version") {
        if (orderDirection === "descending") return compareSemverDesc(b.gameVersion, a.gameVersion);
        return compareSemverAsc(a.gameVersion, b.gameVersion);
      }
      if (sortBy === "whitelist") {
        if (orderDirection === "descending") {
          return Number(b.whitelisted) - Number(a.whitelisted);
        }
        return Number(a.whitelisted) - Number(b.whitelisted);
      }
      // Default player sort keeps the original ascending-first behaviour.
      if (orderDirection === "descending") return a.players - b.players;
      return b.players - a.players;
    });

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-xs">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2" />
          <Input
            className="pl-7"
            placeholder="Search servers…"
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
          />
        </div>

        <Select
          items={(gameVersions ?? [])
            .toSorted(compareSemverDesc)
            .map((v) => ({ label: v, value: v }))}
          multiple
          value={selectedGameVersions}
          onValueChange={syncGameVersions}
        >
          <SelectTrigger className="w-44" aria-label="Game versions">
            <SelectValue>
              {selectedGameVersions.length > 0
                ? selectedGameVersions.length > 1
                  ? `${selectedGameVersions.length} versions`
                  : selectedGameVersions[0]
                : "Game version(s)"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent align="start" alignItemWithTrigger={false}>
            {(gameVersions ?? []).toSorted(compareSemverDesc).map((version) => (
              <SelectItem key={version} value={version}>
                {version}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          items={Object.entries(sortOptions).map(([value, label]) => ({ label, value }))}
          value={sortBy}
          onValueChange={(value) => value && setSortBy(value as ServersFilters["sortBy"])}
        >
          <SelectTrigger className="w-36" aria-label="Sort by">
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="start" alignItemWithTrigger={false}>
            {Object.entries(sortOptions).map(([key, value]) => (
              <SelectItem key={key} value={key}>
                {value}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          aria-label="Toggle sort direction"
          size="icon-sm"
          variant="outline"
          title={
            orderDirection === "descending"
              ? "Sort direction: descending"
              : "Sort direction: ascending"
          }
          onClick={() =>
            setOrderDirection(orderDirection === "descending" ? "ascending" : "descending")
          }
        >
          {orderDirection === "descending" ? <ArrowDownNarrowWide /> : <ArrowUpNarrowWide />}
        </Button>

        <span className="text-muted-foreground ml-auto text-xs">
          {filteredServers.length} server{filteredServers.length === 1 ? "" : "s"}
        </span>
      </div>

      {isPending ? (
        <div className="flex items-center gap-2 border border-dashed p-10 text-center">
          <Loader2 className="text-muted-foreground mx-auto animate-spin" />
        </div>
      ) : filteredServers.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 border border-dashed p-10 text-center">
          <Search className="text-muted-foreground size-6" />
          <div>
            <p className="text-sm font-medium">No public servers match</p>
            <p className="text-muted-foreground text-xs">
              Clear the search or version filters and try again.
            </p>
          </div>
        </div>
      ) : (
        <div className="divide-y border">
          {filteredServers.map((server, index) => {
            const versionInstalled = installedVersionsSet.has(server.gameVersion);
            const hasProfile = profiles.some((p) => p.version === server.gameVersion);
            return (
              <div
                key={`${server.serverIP}-${server.serverName}-${index}`}
                className="bg-card hover:bg-muted/40 flex items-center gap-3 p-3 transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{server.serverName}</p>
                  <p className="text-muted-foreground mt-0.5 font-mono text-[11px]">
                    {server.serverIP}
                  </p>
                  <p className="text-muted-foreground mt-0.5 line-clamp-1 text-xs break-all">
                    {server.gameDescription.replace(/<\/?[^>]+(>|$)/g, "")}
                  </p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <Badge
                      className={
                        versionInstalled ? "text-[var(--color-success)]" : "text-destructive"
                      }
                      variant="outline"
                    >
                      Version {server.gameVersion}
                    </Badge>
                    <Badge className="text-muted-foreground" variant="outline">
                      {server.players}/{server.maxPlayers}
                      <Users2 className="size-3" />
                    </Badge>
                    {server.mods.length > 0 && (
                      <Badge className="text-muted-foreground" variant="outline">
                        Mods {server.mods.length}
                      </Badge>
                    )}
                    {server.whitelisted && (
                      <Badge className="text-muted-foreground" variant="outline">
                        Whitelisted
                        <ListCheck className="size-3" />
                      </Badge>
                    )}
                    {server.hasPassword && (
                      <Badge className="text-muted-foreground" variant="outline">
                        Protected
                        <Lock className="size-3" />
                      </Badge>
                    )}
                  </div>
                </div>

                {versionInstalled ? (
                  <Button
                    size="sm"
                    variant="outline-success"
                    onClick={() => setConnectServer(server)}
                  >
                    <Plug /> Connect
                  </Button>
                ) : hasProfile ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={downloadVersion.isPending}
                    onClick={() => downloadVersion.mutate(server.gameVersion)}
                    title={`Download game version ${server.gameVersion}`}
                  >
                    <DownloadCloud /> Download
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      void navigate({ to: "/profiles" });
                    }}
                    title={`Create a profile with v${server.gameVersion} to connect`}
                  >
                    <FolderPlus /> Add profile
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}

      <PublicServerConnectSheet
        onOpenChange={(open) => !open && setConnectServer(null)}
        open={connectServer !== null}
        server={connectServer}
      />
    </div>
  );
}
