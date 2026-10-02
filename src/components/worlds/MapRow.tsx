import { Map as MapIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import type { MapEntry } from "@/hooks/use-world-map";
import type { Profile } from "@/stores/profiles";

import ViewMapSheet from "./ViewMapSheet";

interface MapRowProps {
  map: MapEntry;
  profile?: Profile;
}

export default function MapRow({ map, profile }: MapRowProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="bg-card hover:bg-muted/40 flex items-center gap-3 p-3 transition-colors">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{map.name}</p>
        <p className="text-muted-foreground mt-0.5 text-[11px]">
          {profile?.name ?? map.profile_name} · Standalone map · No save attached
        </p>
      </div>

      <Button
        onClick={() => setOpen(true)}
        size="sm"
        title={`View map ${map.name}`}
        variant="outline"
      >
        <MapIcon className="text-info" /> View Map
      </Button>

      <ViewMapSheet open={open} onOpenChange={setOpen} mapName={map.name} mapPath={map.path} />
    </div>
  );
}
