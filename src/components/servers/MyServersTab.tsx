import { MapPinPlus, Server } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useServerStore, type Server as SavedServer } from "@/stores/servers";

import ServerFormSheet from "./ServerFormSheet";
import ServerRow from "./ServerRow";

type SheetState = { mode: "add" } | { mode: "edit"; server: SavedServer } | null;

export default function MyServersTab() {
  const { t } = useTranslation();
  const servers = useServerStore((s) => s.servers);
  const [sheet, setSheet] = useState<SheetState>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  /** Bumped per open so the sheet remounts with a clean form. */
  const [sheetSession, setSheetSession] = useState(0);

  function openSheet(next: SheetState) {
    setSheetSession((session) => session + 1);
    setSheet(next);
    setSheetOpen(true);
  }

  const sorted = [...servers].sort((a, b) => {
    if (a.favorite === b.favorite) return a.index - b.index;
    return a.favorite ? -1 : 1;
  });

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="flex shrink-0 items-center justify-between gap-4">
        <p className="text-muted-foreground text-xs">{t("servers.mine.description")}</p>
        <Button size="sm" variant="accent-primary" onClick={() => openSheet({ mode: "add" })}>
          <MapPinPlus /> {t("servers.mine.add")}
        </Button>
      </div>

      <ScrollArea scrollFade className="min-h-0 flex-1">
        {sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 border border-dashed p-10 text-center">
            <Server className="text-muted-foreground size-6" />
            <div>
              <p className="text-sm font-medium">{t("servers.mine.emptyTitle")}</p>
              <p className="text-muted-foreground text-xs">{t("servers.mine.emptyDescription")}</p>
            </div>
            <Button size="sm" variant="accent-primary" onClick={() => openSheet({ mode: "add" })}>
              {t("servers.mine.addFirst")}
            </Button>
          </div>
        ) : (
          <div className="divide-y border">
            {sorted.map((server) => (
              <ServerRow
                key={server.rowKey}
                onEdit={(target) => openSheet({ mode: "edit", server: target })}
                server={server}
              />
            ))}
          </div>
        )}
      </ScrollArea>

      <ServerFormSheet
        key={sheetSession}
        onOpenChange={setSheetOpen}
        onOpenChangeComplete={(open) => {
          if (!open) setSheet(null);
        }}
        open={sheetOpen}
        server={sheet?.mode === "edit" ? sheet.server : null}
      />
    </div>
  );
}
