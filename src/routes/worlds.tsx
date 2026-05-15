import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { SearchInput } from "@/components/inputs";
import { MapItem } from "@/components/items/map.item";
import { WorldList } from "@/components/lists/world.list";
import { ErrorComponent } from "@/components/ui/error";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { useSaves } from "@/hooks/use-saves";
import { useAllMaps } from "@/hooks/use-world-map";
import { cn } from "@/lib/utils";
import { useInstallations } from "@/stores/installations";

export const Route = createFileRoute("/worlds")({
  component: RouteComponent,
  errorComponent: ErrorComponent,
});

function RouteComponent() {
  const [searchText, setSearchText] = useState("");
  const [selectedInstallationId, setSelectedInstallationId] = useState<number | null>(null);

  const { installations } = useInstallations();

  const { data: worlds } = useSaves();
  const { data: allMaps } = useAllMaps();

  // Standalone maps: maps not already attached to a world save
  const standaloneMaps = (allMaps ?? []).filter(
    (map) =>
      !(worlds ?? []).some(
        (w) => w.has_map && w.data.savegame_identifier && map.name === w.data.savegame_identifier,
      ),
  );

  const filteredWorlds = worlds?.filter((world) => {
    const matchesSearchText = world.data.world_name
      .toLowerCase()
      .includes(searchText.toLowerCase());
    const matchesInstallation = selectedInstallationId
      ? installations.find(
          (installation) => installation.path.split("/").pop() === world.installation_name,
        )?.id === selectedInstallationId
      : true;
    return matchesSearchText && matchesInstallation;
  });

  const filteredMaps = standaloneMaps.filter((map) => {
    const matchesSearchText = map.name.toLowerCase().includes(searchText.toLowerCase());
    const matchesInstallation = selectedInstallationId
      ? map.installation_id === selectedInstallationId
      : true;
    return matchesSearchText && matchesInstallation;
  });

  return (
    <div className="grid w-full grid-rows-[min-content_1fr] gap-2" style={{ height: "100vh" }}>
      <div className="bg-background/10 sticky top-0 z-10 flex h-fit flex-wrap items-center gap-2 px-4 py-2 backdrop-blur-md">
        <SearchInput
          onChange={(e) => setSearchText(e.target.value)}
          placeholder="Search worlds and maps..."
          value={searchText}
        />
        <Select value={selectedInstallationId?.toString() || ""}>
          <SelectTrigger
            className={cn("w-46", selectedInstallationId ? "" : "text-muted-foreground")}
          >
            {selectedInstallationId
              ? `${installations.find((installation) => installation.id === selectedInstallationId)?.name}`
              : "Select installation"}
          </SelectTrigger>
          <SelectContent alignItemWithTrigger={false}>
            {installations.map((installation) => (
              <SelectItem
                key={installation.id}
                onClick={() =>
                  setSelectedInstallationId((prev) =>
                    prev === installation.id ? null : installation.id,
                  )
                }
                value={installation.id.toString()}
              >
                {installation.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {filteredWorlds && (
        <div className="relative h-full w-full overflow-auto px-4">
          <WorldList worlds={filteredWorlds} />
          {filteredMaps.length > 0 && (
            <div className="mt-4">
              <p className="text-muted-foreground px-2 py-1 text-xs font-semibold tracking-wider uppercase">
                Maps without saves
              </p>
              <div className="bg-card relative flex w-full flex-col overflow-y-auto rounded border p-2 shadow">
                {filteredMaps.map((map) => (
                  <div key={`map-${map.id}`} className="flex w-full gap-2 p-2 not-last:border-b">
                    <MapItem map={map} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
