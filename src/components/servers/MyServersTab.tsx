import { MapPinPlus, Server } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useServerStore, type Server as SavedServer } from "@/stores/servers";

import ServerFormSheet from "./ServerFormSheet";
import ServerRow from "./ServerRow";

type SheetState = { mode: "add" } | { mode: "edit"; server: SavedServer } | null;

export default function MyServersTab() {
  const servers = useServerStore((s) => s.servers);
  const [sheet, setSheet] = useState<SheetState>(null);

  const sorted = [...servers].sort((a, b) => {
    if (a.favorite === b.favorite) return a.index - b.index;
    return a.favorite ? -1 : 1;
  });

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="flex shrink-0 items-center justify-between gap-4">
        <p className="text-muted-foreground text-xs">
          Servers are stored inside a profile's clientsettings.json.
        </p>
        <Button size="sm" variant="accent-primary" onClick={() => setSheet({ mode: "add" })}>
          <MapPinPlus /> Add server
        </Button>
      </div>

      <ScrollArea scrollFade className="min-h-0 flex-1">
        {sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 border border-dashed p-10 text-center">
            <Server className="text-muted-foreground size-6" />
            <div>
              <p className="text-sm font-medium">No servers yet</p>
              <p className="text-muted-foreground text-xs">
                Add a server to keep its address, password and profile association.
              </p>
            </div>
            <Button size="sm" variant="accent-primary" onClick={() => setSheet({ mode: "add" })}>
              Add your first server
            </Button>
          </div>
        ) : (
          <div className="divide-y border">
            {sorted.map((server) => (
              <ServerRow
                key={server.rowKey}
                onEdit={(target) => setSheet({ mode: "edit", server: target })}
                server={server}
              />
            ))}
          </div>
        )}
      </ScrollArea>

      <ServerFormSheet
        key={sheet?.mode === "edit" ? sheet.server.id : "add"}
        onOpenChange={(open) => !open && setSheet(null)}
        open={sheet !== null}
        server={sheet?.mode === "edit" ? sheet.server : null}
      />
    </div>
  );
}
