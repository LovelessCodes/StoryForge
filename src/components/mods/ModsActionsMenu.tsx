import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { ArrowUpFromLine, Ellipsis, PackageOpen, ShieldAlert } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { buildManifest, manifestFileName, type ModpackManifest } from "@/lib/modpack-manifest";
import { toast } from "@/lib/notify";
import type { OutputMod } from "@/lib/types";

import { ImportModpackSheet } from "./ImportModpackSheet";
import { ModConflictsSheet } from "./ModConflictsSheet";

/**
 * The overflow actions of the mods toolbar: conflict scan and RiftLauncher
 * modpack import/export. Grouping them keeps the toolbar itself to the
 * controls used while browsing.
 */
export function ModsActionsMenu({
  destinationLabel,
  gameVersion,
  installedMods,
  modsDirectory,
}: {
  destinationLabel: string;
  gameVersion: string;
  installedMods: OutputMod[] | undefined;
  modsDirectory: string;
}) {
  const { t } = useTranslation();
  const [conflictsOpen, setConflictsOpen] = useState(false);
  const [importRequest, setImportRequest] = useState<ModpackManifest | null>(null);
  const [picking, setPicking] = useState(false);

  // Exporting or planning an import against a half-loaded mod list would write
  // an empty pack or re-download everything; those items stay disabled until
  // the installed-mods query has answered.
  const ready = installedMods !== undefined;
  const mods = installedMods ?? [];

  async function exportModpack() {
    try {
      const path = await save({
        defaultPath: manifestFileName(destinationLabel),
        filters: [{ name: t("mods.modpackIO.jsonFilter"), extensions: ["json"] }],
      });
      if (!path) return;
      await invoke("write_modpack_manifest", {
        path,
        manifest: buildManifest(destinationLabel, gameVersion, mods),
      });
      toast.success(t("mods.modpackIO.exported"));
    } catch (error) {
      toast.error(t("mods.modpackIO.exportFailed"), {
        description: (error as Error)?.message ?? String(error),
      });
    }
  }

  async function importModpack() {
    try {
      const path = await open({
        multiple: false,
        filters: [{ name: t("mods.modpackIO.jsonFilter"), extensions: ["json"] }],
      });
      if (!path || Array.isArray(path)) return;
      setPicking(true);
      const manifest = await invoke<ModpackManifest>("read_modpack_manifest", { path });
      setImportRequest(manifest);
    } catch (error) {
      toast.error(t("mods.modpackIO.readFailed"), {
        description: (error as Error)?.message ?? String(error),
      });
    } finally {
      setPicking(false);
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              aria-label={t("mods.actions.more")}
              size="icon-sm"
              title={t("mods.actions.more")}
              variant="outline"
            />
          }
        >
          <Ellipsis />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem className="text-nowrap" onClick={() => setConflictsOpen(true)}>
            <ShieldAlert /> {t("mods.actions.conflicts")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-nowrap"
            disabled={picking || !ready}
            onClick={() => void importModpack()}
          >
            <PackageOpen /> {t("mods.modpackIO.import")}
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-nowrap"
            disabled={picking || !ready}
            onClick={() => void exportModpack()}
          >
            <ArrowUpFromLine /> {t("mods.modpackIO.export")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ModConflictsSheet
        modsDirectory={modsDirectory}
        open={conflictsOpen}
        onOpenChange={setConflictsOpen}
      />

      {importRequest && (
        <ImportModpackSheet
          destinationLabel={destinationLabel}
          gameVersion={gameVersion}
          installedMods={mods}
          manifest={importRequest}
          modsDirectory={modsDirectory}
          onOpenChange={(next) => {
            if (!next) setImportRequest(null);
          }}
          open
        />
      )}
    </>
  );
}
