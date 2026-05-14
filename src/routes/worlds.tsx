import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { SearchInput } from "@/components/inputs";
import { WorldList } from "@/components/lists/world.list";
import { ErrorComponent } from "@/components/ui/error";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { useSaves } from "@/hooks/use-saves";
import { cn } from "@/lib/utils";
import { useInstallations } from "@/stores/installations";

export const Route = createFileRoute("/worlds")({
  component: RouteComponent,
  errorComponent: ErrorComponent,
});

function RouteComponent() {
  // States
  const [searchText, setSearchText] = useState("");
  const [selectedInstallationId, setSelectedInstallationId] = useState<number | null>(null);

  // Stores
  const { installations } = useInstallations();

  // Queries
  const { data: worlds } = useSaves();
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

  return (
    <div className="grid w-full grid-rows-[min-content_1fr] gap-2" style={{ height: "100vh" }}>
      <div className="bg-background/10 sticky top-0 z-10 flex h-fit flex-wrap items-center gap-2 px-4 py-2 backdrop-blur-md">
        <SearchInput
          onChange={(e) => setSearchText(e.target.value)}
          placeholder="Search worlds..."
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
        </div>
      )}
    </div>
  );
}
