import { useMemo, useState } from "react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import type { World } from "@/lib/types";

import { WorldMapViewer } from "./WorldMapViewer";

type ViewMapSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** World save to read markers/prospecting logs from, if any. */
  world?: World;
  /** Direct path to a standalone `.db` map (by-passes the world). */
  mapPath?: string;
  mapName?: string;
};

export default function ViewMapSheet({
  open,
  onOpenChange,
  world,
  mapPath,
  mapName,
}: ViewMapSheetProps) {
  const worldData = world?.data;
  const mapMarkers = world?.map_markers;
  const prospectingLogs = world?.prospecting_logs;

  const displayName = mapName ?? worldData?.world_name ?? "Map";

  // Union of waypoint marker owners and prospecting log owners.
  const players = useMemo(() => {
    const playerSet = new Set<string>();
    for (const marker of mapMarkers?.markers ?? []) {
      if (marker.player_uid) playerSet.add(marker.player_uid);
    }
    for (const log of prospectingLogs ?? []) {
      if (log[0]) playerSet.add(log[0]);
    }
    return Array.from(playerSet);
  }, [mapMarkers, prospectingLogs]);

  const [pickedPlayer, setPickedPlayer] = useState<string | null>(null);
  const [showProspect, setShowProspect] = useState(true);

  // Data loads async, so the default selection can only be resolved once the
  // player list exists. Derive a valid selection at render time; the first
  // player is used until the user picks another one.
  const selectedPlayer =
    pickedPlayer && players.includes(pickedPlayer) ? pickedPlayer : (players[0] ?? null);

  const playerItems = players.map((playerUid) => ({ label: playerUid, value: playerUid }));

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-4xl">
        <SheetHeader className="border-b">
          <SheetTitle>{displayName} — World Map</SheetTitle>
          <SheetDescription>Interactive map viewer · Drag to pan · Scroll to zoom</SheetDescription>
        </SheetHeader>

        <div className="flex flex-wrap items-center gap-4 border-b p-4">
          <Select
            items={playerItems}
            value={selectedPlayer}
            onValueChange={(value) => setPickedPlayer(typeof value === "string" ? value : null)}
          >
            <SelectTrigger
              className="w-56"
              disabled={players.length === 0}
              aria-label="Player whose markers are shown"
            >
              <SelectValue placeholder="No players found" />
            </SelectTrigger>
            <SelectContent>
              {playerItems.map((player) => (
                <SelectItem key={player.value} value={player.value}>
                  {player.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <label className="flex items-center gap-2 text-xs" htmlFor="show-prospect">
            <Switch checked={showProspect} id="show-prospect" onCheckedChange={setShowProspect} />
            Show prospecting
          </label>
        </div>

        <div className="flex min-h-0 flex-1 p-4">
          <WorldMapViewer
            mapMarkers={mapMarkers}
            mapPath={mapPath}
            prospectingLogs={prospectingLogs}
            selectedPlayer={selectedPlayer}
            showProspect={showProspect}
            worldPath={world?.path}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
