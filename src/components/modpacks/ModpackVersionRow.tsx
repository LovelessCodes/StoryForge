import { CheckIcon, Download, Pencil, Trash2, XIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import type { ModpackItem } from "@/hooks/use-modpacks";

import DeleteVersionInline from "./DeleteVersionInline";
import ModpackModsList from "./ModpackModsList";

export type ModpackVersion = ModpackItem["modpackVersions"][number];

export type ImportProgress = {
  current: number;
  total: number;
  modid: string;
  version: string;
};

interface ModpackVersionRowProps {
  modpackSlug: string;
  version: ModpackVersion;
  isOwner: boolean;
  /** True while any version of the pack is being installed. */
  importing: boolean;
  /** True when this version is waiting for the profile name. */
  naming: boolean;
  installed: boolean;
  installName: string;
  importProgress: ImportProgress | null;
  modsOpen: boolean;
  deleteOpen: boolean;
  onCancelDelete: () => void;
  onCancelInstall: () => void;
  onConfirmInstall: () => void;
  onDelete: () => void;
  onEdit: () => void;
  onInstall: () => void;
  onInstallNameChange: (name: string) => void;
  onModsOpenChange: (open: boolean) => void;
}

/** One version of a modpack: metadata, mods list and the install flow. */
export default function ModpackVersionRow({
  modpackSlug,
  version,
  isOwner,
  importing,
  naming,
  installed,
  installName,
  importProgress,
  modsOpen,
  deleteOpen,
  onCancelDelete,
  onCancelInstall,
  onConfirmInstall,
  onDelete,
  onEdit,
  onInstall,
  onInstallNameChange,
  onModsOpenChange,
}: ModpackVersionRowProps) {
  const { t } = useTranslation();

  return (
    <div className="bg-card grid min-w-0 gap-3 border p-3">
      <div className="flex items-center gap-3">
        <div className="grid min-w-0 flex-1 gap-0.5">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="font-mono text-xs font-medium">v{version.version}</span>
            <span className="text-muted-foreground font-mono text-[10px]">
              {t("modpacks.detail.forVs", { version: version.gameVersion })}
            </span>
          </div>
          <span className="text-muted-foreground/70 text-[11px]">
            {t("modpacks.downloads", { count: version.downloads })}
          </span>
          {version.changelog && (
            <p className="text-muted-foreground/80 line-clamp-3 text-[11px] whitespace-pre-wrap">
              {version.changelog}
            </p>
          )}
        </div>

        {isOwner && !naming && (
          <div className="flex shrink-0 items-center gap-0.5">
            <Button
              aria-label={t("modpacks.detail.editVersion", { version: version.version })}
              size="icon-sm"
              variant="ghost"
              onClick={onEdit}
            >
              <Pencil />
            </Button>
            <Button
              aria-label={t("modpacks.detail.deleteVersion", { version: version.version })}
              className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              size="icon-sm"
              variant="ghost"
              onClick={onDelete}
            >
              <Trash2 />
            </Button>
          </div>
        )}

        {!naming && (
          <Button
            className="shrink-0"
            disabled={importing}
            size="sm"
            variant={installed ? "accent-primary" : "outline-accent-primary"}
            onClick={onInstall}
          >
            <Download />
            {installed
              ? t("common.actions.install")
              : t("modpacks.detail.needVs", { version: version.gameVersion })}
          </Button>
        )}
      </div>

      <ModpackModsList
        modsString={version.modsString}
        open={modsOpen}
        onOpenChange={onModsOpenChange}
      />

      {deleteOpen && (
        <DeleteVersionInline
          modpackSlug={modpackSlug}
          version={version.version}
          onCancel={onCancelDelete}
        />
      )}

      {naming && (
        <div className="grid gap-2">
          <div className="flex items-end gap-2">
            <div className="grid flex-1 gap-1.5">
              <label
                className="text-muted-foreground text-[11px] font-medium"
                htmlFor={`install-name-${version.id}`}
              >
                {t("modpacks.install.profileName")}
              </label>
              <Input
                autoFocus
                disabled={importing}
                id={`install-name-${version.id}`}
                placeholder={t("modpacks.install.profilePlaceholder")}
                value={installName}
                onChange={(event) => onInstallNameChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !importing) {
                    onConfirmInstall();
                  }
                  if (event.key === "Escape") onCancelInstall();
                }}
              />
            </div>
            <Button
              aria-label={t("modpacks.install.confirmAria")}
              disabled={importing || !installName.trim()}
              size="icon-sm"
              variant="accent-primary"
              onClick={onConfirmInstall}
            >
              <CheckIcon />
            </Button>
            <Button
              aria-label={t("modpacks.install.cancelAria")}
              disabled={importing}
              size="icon-sm"
              variant="ghost"
              onClick={onCancelInstall}
            >
              <XIcon />
            </Button>
          </div>

          {importProgress && <ImportProgressBar progress={importProgress} />}
        </div>
      )}
    </div>
  );
}

/** Per-mod download progress while a modpack version is being installed. */
function ImportProgressBar({ progress }: { progress: ImportProgress }) {
  const { t } = useTranslation();
  return (
    <div className="grid gap-1">
      <p className="text-muted-foreground text-[11px]">
        {t("modpacks.install.progress", { current: progress.current, total: progress.total })}{" "}
        <span className="text-foreground font-medium">{progress.modid}</span>
        <span className="text-muted-foreground">@{progress.version}</span>
      </p>
      <Progress value={Math.round((progress.current / progress.total) * 100)} />
    </div>
  );
}
