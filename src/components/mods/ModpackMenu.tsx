import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { ArrowUpFromLine, Package, PackageOpen } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { buildManifest, manifestFileName, type ModpackManifest } from "@/lib/modpack-manifest";
import { toast } from "@/lib/notify";
import type { OutputMod } from "@/lib/types";

import { ImportModpackSheet } from "./ImportModpackSheet";

type ImportRequest = { manifest: ModpackManifest };

/**
 * Profile-level modpack import/export in the RiftLauncher manifest format
 * (the only cross-launcher pack file in circulation).
 */
export function ModpackMenu({
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
  const [importRequest, setImportRequest] = useState<ImportRequest | null>(null);
  const [picking, setPicking] = useState(false);

  // Exporting or planning an import against a half-loaded mod list would write
  // an empty pack or re-download everything; the menu stays shut until the
  // installed-mods query has answered.
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
      setImportRequest({ manifest });
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
              aria-label={t("mods.modpackIO.menuTrigger")}
              disabled={picking || !ready}
              size="icon-sm"
              title={t("mods.modpackIO.menuTrigger")}
              variant="outline"
            />
          }
        >
          <Package />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => void importModpack()}>
            <PackageOpen /> {t("mods.modpackIO.import")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => void exportModpack()}>
            <ArrowUpFromLine /> {t("mods.modpackIO.export")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {importRequest && (
        <ImportModpackSheet
          destinationLabel={destinationLabel}
          gameVersion={gameVersion}
          installedMods={mods}
          manifest={importRequest.manifest}
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
