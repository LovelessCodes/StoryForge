import { ArrowUpCircle } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import type { ModUpdatesResponse } from "@/hooks/use-mod-updates";
import type { OutputMod } from "@/lib/types";

import { BulkUpdateSheet } from "./BulkUpdateSheet";

/** Opens the review sheet for every pending mod update. */
export function UpdateAllButton({
  destinationLabel,
  installedMods,
  modsDirectory,
  updates,
}: {
  modsDirectory: string;
  destinationLabel: string;
  updates: ModUpdatesResponse;
  installedMods: OutputMod[];
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const updateCount = Object.keys(updates.updates).length;

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        disabled={updateCount === 0}
        onClick={() => setOpen(true)}
      >
        <ArrowUpCircle />
        {t("mods.updateAll.button", { count: updateCount })}
      </Button>
      <BulkUpdateSheet
        destinationLabel={destinationLabel}
        installedMods={installedMods}
        modsDirectory={modsDirectory}
        open={open}
        onOpenChange={setOpen}
        updates={updates}
      />
    </>
  );
}
