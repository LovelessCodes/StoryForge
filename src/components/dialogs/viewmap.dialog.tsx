import { useMemo, useState } from "react";

import { WorldMapViewer } from "@/components/maps/world-map-viewer";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import type { World } from "@/lib/types";
import { useDialogStore } from "@/stores/dialogs";

export type ViewMapDialogProps = {
  world?: World;
  mapPath?: string;
  mapName?: string;
};

export function ViewMapDialog({
  open,
  world,
  mapPath: directMapPath,
  mapName,
}: {
  open: boolean;
} & ViewMapDialogProps) {
  const { closeDialog } = useDialogStore();
  const worldData = world?.data;
  const worldPath = world?.path;
  const mapMarkers = world?.map_markers;
  const prospectingLogs = world?.prospecting_logs;

  // Use direct map path if provided, otherwise derive from world
  const displayName = mapName ?? worldData?.world_name ?? "Map";
  const players = useMemo(() => {
    const players: string[] = [];
    if (mapMarkers && prospectingLogs) {
      for (const marker of mapMarkers.markers) {
        if (marker.player_uid && !players.includes(marker.player_uid)) {
          players.push(marker.player_uid);
        }
      }
      for (const log of prospectingLogs) {
        if (log[0] && !players.includes(log[0])) {
          players.push(log[0]);
        }
      }
    }
    return players;
  }, [mapMarkers, prospectingLogs]);
  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(
    players.length > 0 ? players[0] : null,
  );
  const [showProspect, setShowProspect] = useState(true);

  return (
    <Dialog onOpenChange={closeDialog} open={open}>
      <DialogClose />
      <DialogContent
        className="flex flex-col gap-0 p-0"
        style={{
          height: "85vh",
          maxHeight: "85vh",
          maxWidth: "80vw",
          width: "80vw",
        }}
      >
        <DialogHeader className="shrink-0 border-b px-6 pt-6 pb-4">
          <DialogTitle>{displayName} - World Map</DialogTitle>
          <DialogDescription>
            Interactive map viewer • Drag to pan • Scroll to zoom
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-1 px-4">
          <Select onValueChange={setSelectedPlayer} value={selectedPlayer ?? ""}>
            <SelectTrigger>
              {selectedPlayer ? `Viewing markers for: ${selectedPlayer}` : "Select Player"}
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false}>
              {players.map((playerUid) => (
                <SelectItem key={playerUid} value={playerUid}>
                  {playerUid}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex gap-2">
            <Checkbox
              checked={showProspect}
              id="show-prospect"
              onCheckedChange={(v) => setShowProspect(!!v)}
            />
            <label className="text-sm select-none" htmlFor="show-prospect">
              Show Prospecting
            </label>
          </div>
        </div>

        <div className="min-h-0 w-full flex-1 overflow-hidden p-4">
          <WorldMapViewer
            mapMarkers={mapMarkers}
            mapPath={directMapPath}
            prospectingLogs={prospectingLogs}
            selectedPlayer={selectedPlayer}
            showProspect={showProspect}
            worldPath={worldPath}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
