import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useRef } from "react";

import { SearchInput } from "@/components/inputs";
import { PublicServerList } from "@/components/lists/public.servers.list";
import { TextSwitch } from "@/components/switches/text.switch";
import { ErrorComponent } from "@/components/ui/error";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { publicServersQuery } from "@/hooks/use-public-servers";
import { gameVersionsQuery } from "@/lib/queries";
import { compareSemverDesc } from "@/lib/utils";
import { type ServersFilters, useServersFilters } from "@/stores/serversFilters";

export const Route = createFileRoute("/public-servers")({
  component: RouteComponent,
  errorComponent: ErrorComponent,
});

const sortOptions: Record<ServersFilters["sortBy"], string> = {
  maxplayers: "Max Players",
  mods: "Mods",
  name: "Name",
  players: "Players",
  version: "Version",
  whitelist: "Whitelist",
};

function RouteComponent() {
  // Refs
  const parentRef = useRef<HTMLDivElement | null>(null);

  // Stores
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

  // Queries
  const { data: gameVersions } = useQuery(gameVersionsQuery);
  const { data: publicServers } = useQuery(publicServersQuery());
  return (
    <div className="grid w-full grid-rows-[min-content_1fr] gap-2" style={{ height: "100vh" }}>
      <div className="bg-background/10 sticky top-0 z-10 flex h-fit flex-wrap items-center gap-2 px-4 py-2 backdrop-blur-md">
        <SearchInput
          onChange={(e) => setSearchText(e.target.value)}
          placeholder="Search servers..."
          value={searchText}
        />
        <Select multiple value={selectedGameVersions}>
          <SelectTrigger className="flex w-46 gap-1 truncate">
            {selectedGameVersions.length > 0
              ? selectedGameVersions.length > 1
                ? `${selectedGameVersions.length} versions`
                : selectedGameVersions[0]
              : "Game version(s)"}
          </SelectTrigger>
          <SelectContent align="start" alignItemWithTrigger={false}>
            {gameVersions?.sort(compareSemverDesc).map((version) => (
              <SelectItem
                key={version}
                onClick={() =>
                  selectedGameVersions.includes(version)
                    ? removeGameVersion(version)
                    : addGameVersion(version)
                }
              >
                {version}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          onValueChange={(value) => setSortBy(value as ServersFilters["sortBy"])}
          value={sortBy}
        >
          <SelectTrigger className="flex w-36 gap-1 truncate">
            {sortBy ? `${sortOptions[sortBy as keyof typeof sortOptions]}` : "Sort by"}
          </SelectTrigger>
          <SelectContent align="start" alignItemWithTrigger={false}>
            {Object.entries(sortOptions).map(([key, value]) => (
              <SelectItem key={key} value={key}>
                {value}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <TextSwitch
          checked={orderDirection === "descending"}
          onCheckedChange={(checked) => setOrderDirection(checked ? "descending" : "ascending")}
          textChecked="Asc"
          textUnchecked="Desc"
        />
      </div>
      <div className="h-full w-full overflow-hidden px-4">
        <div
          className="bg-card relative h-full w-full overflow-auto rounded border p-2 shadow"
          ref={parentRef}
        >
          {publicServers && (
            <PublicServerList parentRef={parentRef} publicServers={publicServers?.data} />
          )}
        </div>
      </div>
    </div>
  );
}
