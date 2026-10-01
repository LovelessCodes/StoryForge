import { Globe, Search } from "lucide-react";
import { useState } from "react";

import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useActiveProfile } from "@/hooks/use-active-profile";
import { useSaves } from "@/hooks/use-saves";
import { useAllMaps } from "@/hooks/use-world-map";

import MapRow from "./MapRow";
import WorldRow from "./WorldRow";
import { findWorldProfile } from "./worlds-utils";

const ALL_PROFILES = "all";

export default function WorldsPage() {
  const [searchText, setSearchText] = useState("");
  const [selectedProfileId, setSelectedProfileId] = useState<number | null>(null);

  const { activeProfile, profiles } = useActiveProfile();
  const { data: worlds, isPending } = useSaves();
  const { data: allMaps } = useAllMaps();

  // Standalone maps: maps not already attached to a world save
  const standaloneMaps = (allMaps ?? []).filter(
    (map) =>
      !(worlds ?? []).some(
        (world) =>
          world.has_map &&
          world.data.savegame_identifier &&
          map.name === world.data.savegame_identifier,
      ),
  );

  const search = searchText.trim().toLowerCase();

  const filteredWorlds = (worlds ?? [])
    .filter((world) => {
      const matchesSearch = world.data.world_name.toLowerCase().includes(search);
      const matchesProfile =
        selectedProfileId === null || findWorldProfile(profiles, world)?.id === selectedProfileId;
      return matchesSearch && matchesProfile;
    })
    .toSorted((a, b) => {
      const aLastPlayed = a.data.last_played ? new Date(a.data.last_played).getTime() : 0;
      const bLastPlayed = b.data.last_played ? new Date(b.data.last_played).getTime() : 0;
      return bLastPlayed - aLastPlayed;
    });

  const filteredMaps = standaloneMaps.filter((map) => {
    const matchesSearch = map.name.toLowerCase().includes(search);
    const matchesProfile = selectedProfileId === null || map.profile_id === selectedProfileId;
    return matchesSearch && matchesProfile;
  });

  const hasWorlds = (worlds ?? []).length > 0;
  const hasMaps = standaloneMaps.length > 0;
  const filterActive = search !== "" || selectedProfileId !== null;

  const profileItems = profiles.map((profile) => ({
    label: profile.name,
    value: String(profile.id),
  }));

  return (
    <div className="grid gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold">Worlds</h1>
          <p className="text-muted-foreground text-xs">
            Browse the worlds of your profiles, launch them, and explore their maps.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <InputGroup className="w-full sm:w-72">
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
          <InputGroupInput
            aria-label="Search worlds and maps"
            onChange={(event) => setSearchText(event.target.value)}
            placeholder="Search worlds and maps…"
            value={searchText}
          />
        </InputGroup>

        <Select
          items={[{ label: "All profiles", value: ALL_PROFILES }, ...profileItems]}
          value={selectedProfileId === null ? ALL_PROFILES : String(selectedProfileId)}
          onValueChange={(value) =>
            setSelectedProfileId(
              typeof value !== "string" || value === ALL_PROFILES ? null : Number(value),
            )
          }
        >
          <SelectTrigger className="w-44" aria-label="Filter by profile">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_PROFILES}>All profiles</SelectItem>
            {profileItems.map((profile) => (
              <SelectItem key={profile.value} value={profile.value}>
                {profile.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isPending ? (
        <p className="text-muted-foreground text-sm">Loading worlds…</p>
      ) : (
        <>
          <section className="grid gap-2">
            <h2 className="text-muted-foreground text-[11px] font-semibold tracking-wider uppercase">
              Worlds{filteredWorlds.length > 0 ? ` (${filteredWorlds.length})` : ""}
            </h2>

            {filteredWorlds.length === 0 ? (
              !hasWorlds && !hasMaps && !filterActive ? (
                <div className="flex flex-col items-center justify-center gap-3 border border-dashed p-10 text-center">
                  <Globe className="text-muted-foreground size-6" />
                  <p className="text-muted-foreground text-xs">
                    No worlds found yet. Create a world in-game to get started.
                  </p>
                </div>
              ) : (
                <p className="text-muted-foreground text-sm">No worlds match your filters.</p>
              )
            ) : (
              <div className="divide-y border">
                {filteredWorlds.map((world) => (
                  <WorldRow
                    activeProfile={activeProfile}
                    key={world.path}
                    profiles={profiles}
                    world={world}
                  />
                ))}
              </div>
            )}
          </section>

          {filteredMaps.length > 0 && (
            <section className="grid gap-2">
              <h2 className="text-muted-foreground text-[11px] font-semibold tracking-wider uppercase">
                Maps without saves ({filteredMaps.length})
              </h2>
              <div className="divide-y border">
                {filteredMaps.map((map) => (
                  <MapRow
                    key={map.id}
                    map={map}
                    profile={profiles.find((profile) => profile.id === map.profile_id)}
                  />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
