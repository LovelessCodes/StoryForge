import { useQueryClient } from "@tanstack/react-query";
import { ArchiveRestore, X } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import {
  legacyInstallationsQueryKey,
  useLegacyInstallations,
} from "@/hooks/use-legacy-installations";
import { useProfilesStore } from "@/stores/profiles";
import { useSettingsStore } from "@/stores/settings";

import LegacyMigrationSheet from "./LegacyMigrationSheet";

/**
 * Banner for installations detected in the previous Story Forge's data
 * folder. Custom locations can be pointed at through the locate flow
 * (see LegacyLocateRow); this banner covers the automatically found ones.
 */
export default function LegacyMigrationBanner() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data: legacy } = useLegacyInstallations();
  const dismissed = useSettingsStore((s) => s.legacyMigrationDismissed);
  const dismiss = useSettingsStore((s) => s.dismissLegacyMigration);
  const { loadProfiles } = useProfilesStore();
  const [open, setOpen] = useState(false);

  const pending = (legacy ?? []).filter((item) => !item.already_migrated);

  return (
    <>
      {!dismissed && pending.length > 0 && (
        <div className="border-accent-primary/30 bg-accent-primary/5 flex flex-wrap items-center gap-3 border p-3">
          <ArchiveRestore className="text-accent-primary size-4 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium">
              {t("profiles.legacy.found", { count: pending.length })}
            </p>
            <p className="text-muted-foreground text-[11px]">
              {t("profiles.import.bannerDescription")}
            </p>
          </div>
          <Button size="sm" variant="accent-primary" onClick={() => setOpen(true)}>
            {t("profiles.import.action")}
          </Button>
          <Button
            aria-label={t("common.actions.dismiss")}
            size="icon-sm"
            variant="ghost"
            onClick={dismiss}
          >
            <X />
          </Button>
        </div>
      )}

      <LegacyMigrationSheet
        open={open}
        onOpenChange={setOpen}
        installations={legacy ?? []}
        root={null}
        onImported={async () => {
          await loadProfiles();
          await queryClient.invalidateQueries({ queryKey: legacyInstallationsQueryKey });
        }}
      />
    </>
  );
}
