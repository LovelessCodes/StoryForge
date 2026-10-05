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
import { useTranslation } from "react-i18next";

import VirtualList from "@/components/common/VirtualList";
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

export default function PublicServersTab() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const sortOptions: Record<ServersFilters["sortBy"], string> = {
    maxplayers: t("servers.public.sort.maxplayers"),
    mods: t("servers.public.sort.mods"),
    name: t("servers.public.sort.name"),
    players: t("servers.public.sort.players"),
    version: t("servers.public.sort.version"),
    whitelist: t("servers.public.sort.whitelist"),
  };
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
  const [connectOpen, setConnectOpen] = useState(false);
  /** Bumped per open so the sheet remounts with a clean form. */
  const [connectSession, setConnectSession] = useState(0);

  function openConnect(server: PublicServer) {
    setConnectSession((session) => session + 1);
    setConnectServer(server);
    setConnectOpen(true);
  }

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
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <div className="relative w-full max-w-xs">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2" />
          <Input
            className="pl-7"
            placeholder={t("servers.public.searchPlaceholder")}
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
          <SelectTrigger className="w-44" aria-label={t("servers.public.gameVersionsAria")}>
            <SelectValue>
              {selectedGameVersions.length > 0
                ? selectedGameVersions.length > 1
                  ? t("servers.public.selectedVersions", { count: selectedGameVersions.length })
                  : selectedGameVersions[0]
                : t("servers.public.gameVersionsPlaceholder")}
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
          <SelectTrigger className="w-36" aria-label={t("servers.public.sortBy")}>
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
          aria-label={t("servers.public.toggleSortDirection")}
          size="icon-sm"
          variant="outline"
          title={
            orderDirection === "descending"
              ? t("servers.public.sortDescending")
              : t("servers.public.sortAscending")
          }
          onClick={() =>
            setOrderDirection(orderDirection === "descending" ? "ascending" : "descending")
          }
        >
          {orderDirection === "descending" ? <ArrowDownNarrowWide /> : <ArrowUpNarrowWide />}
        </Button>

        <span className="text-muted-foreground ml-auto text-xs">
          {t("servers.public.count", { count: filteredServers.length })}
        </span>
      </div>

      {isPending ? (
        <div className="flex items-center gap-2 border border-dashed p-10 text-center">
          <Loader2 className="text-muted-foreground mx-auto animate-spin" />
        </div>
      ) : (
        <VirtualList
          empty={
            <div className="flex flex-col items-center justify-center gap-3 border border-dashed p-10 text-center">
              <Search className="text-muted-foreground size-6" />
              <div>
                <p className="text-sm font-medium">{t("servers.public.emptyTitle")}</p>
                <p className="text-muted-foreground text-xs">
                  {t("servers.public.emptyDescription")}
                </p>
              </div>
            </div>
          }
          estimateRowHeight={120}
          items={filteredServers}
          keyOf={(server, index) => `${server.serverIP}-${server.serverName}-${index}`}
          renderItem={(server) => (
            <PublicServerRow
              downloading={downloadVersion.isPending}
              hasProfile={profiles.some((p) => p.version === server.gameVersion)}
              onAddProfile={() => {
                void navigate({ to: "/profiles" });
              }}
              onConnect={() => openConnect(server)}
              onDownload={() => downloadVersion.mutate(server.gameVersion)}
              server={server}
              versionInstalled={installedVersionsSet.has(server.gameVersion)}
            />
          )}
          scrollButtonAlign="center"
        />
      )}

      <PublicServerConnectSheet
        key={connectSession}
        onOpenChange={setConnectOpen}
        onOpenChangeComplete={(open) => {
          if (!open) setConnectServer(null);
        }}
        open={connectOpen}
        server={connectServer}
      />
    </div>
  );
}

/** One public server row, rendered by the virtualized list. */
function PublicServerRow({
  server,
  versionInstalled,
  hasProfile,
  downloading,
  onConnect,
  onDownload,
  onAddProfile,
}: {
  server: PublicServer;
  versionInstalled: boolean;
  hasProfile: boolean;
  downloading: boolean;
  onConnect: () => void;
  onDownload: () => void;
  onAddProfile: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="bg-card hover:bg-muted/40 flex items-center gap-3 border p-3 transition-colors">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{server.serverName}</p>
        <p className="text-muted-foreground mt-0.5 font-mono text-[11px]">{server.serverIP}</p>
        <p className="text-muted-foreground mt-0.5 line-clamp-1 text-xs break-all">
          {server.gameDescription.replace(/<\/?[^>]+(>|$)/g, "")}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <Badge
            className={versionInstalled ? "text-[var(--color-success)]" : "text-destructive"}
            variant="outline"
          >
            {t("servers.public.versionBadge", { version: server.gameVersion })}
          </Badge>
          <Badge className="text-muted-foreground" variant="outline">
            {server.players}/{server.maxPlayers}
            <Users2 className="size-3" />
          </Badge>
          {server.mods.length > 0 && (
            <Badge className="text-muted-foreground" variant="outline">
              {t("servers.public.modsBadge", { count: server.mods.length })}
            </Badge>
          )}
          {server.whitelisted && (
            <Badge className="text-muted-foreground" variant="outline">
              {t("servers.public.whitelisted")}
              <ListCheck className="size-3" />
            </Badge>
          )}
          {server.hasPassword && (
            <Badge className="text-muted-foreground" variant="outline">
              {t("servers.public.protected")}
              <Lock className="size-3" />
            </Badge>
          )}
        </div>
      </div>

      {versionInstalled ? (
        <Button size="sm" variant="outline-success" onClick={onConnect}>
          <Plug /> {t("servers.actions.connect")}
        </Button>
      ) : hasProfile ? (
        <Button
          disabled={downloading}
          onClick={onDownload}
          size="sm"
          title={t("servers.public.downloadTitle", { version: server.gameVersion })}
          variant="outline"
        >
          <DownloadCloud /> {t("servers.actions.download")}
        </Button>
      ) : (
        <Button
          onClick={onAddProfile}
          size="sm"
          title={t("servers.public.addProfileTitle", { version: server.gameVersion })}
          variant="outline"
        >
          <FolderPlus /> {t("servers.public.addProfile")}
        </Button>
      )}
    </div>
  );
}
