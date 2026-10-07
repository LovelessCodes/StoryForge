import { useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { open as openDirectoryDialog } from "@tauri-apps/plugin-dialog";
import { FolderInput } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import {
  legacyInstallationsQueryKey,
  useLegacyInstallations,
} from "@/hooks/use-legacy-installations";
import { toast } from "@/lib/notify";
import type { LegacyInstallation } from "@/lib/types";
import { useProfilesStore } from "@/stores/profiles";
import { useSettingsStore } from "@/stores/settings";

import LegacyMigrationSheet from "./LegacyMigrationSheet";

/**
 * Fallback for installations folders the automatic scan cannot know about
 * (custom locations from the previous app, data from another install channel):
 * lets the user point the import at the folder directly. Hidden while the
 * detected-installs banner has something to show, and when dismissed.
 */
export default function LegacyLocateRow() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data: legacy } = useLegacyInstallations();
  const dismissed = useSettingsStore((s) => s.legacyMigrationDismissed);
  const { loadProfiles } = useProfilesStore();
  const [installations, setInstallations] = useState<LegacyInstallation[]>([]);
  const [root, setRoot] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const pending = (legacy ?? []).filter((item) => !item.already_migrated);
  if (dismissed || pending.length > 0) return null;

  async function locate() {
    const picked = await openDirectoryDialog({ directory: true, multiple: false });
    if (typeof picked !== "string") return;
    try {
      const found = await invoke<LegacyInstallation[]>("detect_legacy_installations", {
        root: picked,
      });
      if (found.length === 0) {
        toast.info(t("profiles.legacy.locateNoResults"));
        return;
      }
      setRoot(picked);
      setInstallations(found);
      setOpen(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(message);
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 border border-dashed p-3">
        <FolderInput className="text-muted-foreground size-4 shrink-0" />
        <p className="text-muted-foreground min-w-0 flex-1 text-[11px]">
          {t("profiles.legacy.locateHint")}
        </p>
        <Button size="sm" variant="outline" onClick={() => void locate()}>
          {t("profiles.legacy.locateAction")}
        </Button>
      </div>

      <LegacyMigrationSheet
        open={open}
        onOpenChange={setOpen}
        installations={installations}
        root={root}
        onImported={async () => {
          await loadProfiles();
          await queryClient.invalidateQueries({ queryKey: legacyInstallationsQueryKey });
        }}
      />
    </>
  );
}
