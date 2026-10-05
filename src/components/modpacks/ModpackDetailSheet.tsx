import { useNavigate } from "@tanstack/react-router";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { Boxes, CheckIcon, Download, Pencil, Plus, Trash2, XIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useAppFolder } from "@/hooks/use-app-folder";
import { useAuthSession } from "@/hooks/use-auth-session";
import { useDownloadVersion } from "@/hooks/use-download-version";
import { useInstalledVersionNames } from "@/hooks/use-installed-versions";
import type { ModpackItem } from "@/hooks/use-modpacks";
import { authClient } from "@/lib/auth";
import { buildProfilePath, makeStringFolderSafe } from "@/lib/helpers";
import { toast } from "@/lib/notify";
import { useProfiles, useProfilesStore } from "@/stores/profiles";
import { useSettingsStore } from "@/stores/settings";

import DeleteVersionInline from "./DeleteVersionInline";
import ModpackImage from "./ModpackImage";
import ModpackModsList from "./ModpackModsList";
import ModpackVersionForm from "./ModpackVersionForm";

type ModpackVersion = ModpackItem["modpackVersions"][number];

type ImportProgress = {
  current: number;
  total: number;
  modid: string;
  version: string;
};

interface ModpackDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Fires after the close animation finishes (the parent clears its state). */
  onOpenChangeComplete?: (open: boolean) => void;
  modpack: ModpackItem;
}

/** Modpack details: description, versions, per-version mods and the install flow. */
export default function ModpackDetailSheet({
  open,
  onOpenChange,
  onOpenChangeComplete,
  modpack,
}: ModpackDetailSheetProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuthSession();
  const { appFolder } = useAppFolder();
  const { profilesParent, profilesSubdir } = useSettingsStore();
  const loadProfiles = useProfilesStore((state) => state.loadProfiles);
  const { profiles } = useProfiles();
  const installedVersions = useInstalledVersionNames();
  const installedVersionsSet = new Set(installedVersions);
  const { mutateAsync: downloadVersion } = useDownloadVersion();

  const isOwner = user?.id === modpack.owner.id;
  const sortedVersions = modpack.modpackVersions.toSorted((a, b) => b.createdAt - a.createdAt);

  const [installingVersionId, setInstallingVersionId] = useState<string | null>(null);
  const [installName, setInstallName] = useState("");
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<ImportProgress | null>(null);
  const listenRef = useRef<UnlistenFn | null>(null);

  // null = not editing, "new" = adding a version, otherwise the version id being edited.
  const [editingVersionId, setEditingVersionId] = useState<string | null>(null);
  const [deleteVersionId, setDeleteVersionId] = useState<string | null>(null);
  const [expandedModsVersionId, setExpandedModsVersionId] = useState<string | null>(null);

  // Stop listening for import progress when the sheet unmounts.
  useEffect(
    () => () => {
      listenRef.current?.();
      listenRef.current = null;
    },
    [],
  );

  const cancelInstall = () => {
    listenRef.current?.();
    listenRef.current = null;
    setInstallingVersionId(null);
    setInstallName("");
    setImporting(false);
    setImportProgress(null);
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) cancelInstall();
    onOpenChange(next);
  };

  const handleInstallClick = (version: ModpackVersion) => {
    setInstallingVersionId(version.id);
    setInstallName(`${modpack.name} v${version.version}`);
  };

  const handleConfirmInstall = async (version: ModpackVersion) => {
    const safeName = makeStringFolderSafe(installName);
    const basePath = profilesParent ?? appFolder ?? "";
    const profilePath = buildProfilePath(basePath, safeName, profilesSubdir);

    setImporting(true);
    setImportProgress(null);

    try {
      if (!installedVersionsSet.has(version.gameVersion)) {
        await downloadVersion(version.gameVersion);
      }

      await invoke("initialize_game", { path: profilePath });

      // Tauri event names only allow alphanumerics, -, /, : and _ — no dots.
      const emitevent = `import-modpack-${modpack.slug.replace(/\./g, "-")}-${version.version.replace(/\./g, "-")}`;
      listenRef.current = await listen<ImportProgress & { phase: string }>(emitevent, (event) => {
        if (event.payload.phase === "downloading") {
          setImportProgress({
            current: event.payload.current,
            modid: event.payload.modid,
            total: event.payload.total,
            version: event.payload.version,
          });
        }
      });

      await invoke("import_profile", {
        params: {
          emitevent,
          modConfigUrl: version.modConfigsUrl || null,
          modpackSlug: modpack.slug,
          modpackVersion: version.version,
          mods: version.modsString,
          name: installName,
          safeName,
          startParams: "",
          version: version.gameVersion,
        },
      });

      listenRef.current?.();
      listenRef.current = null;

      // Bump the download counter server-side.
      void authClient.downloadModpackVersion(modpack.slug, version.version);

      setInstallingVersionId(null);
      setImporting(false);
      setImportProgress(null);
      void loadProfiles();
      onOpenChange(false);
      void navigate({ to: "/profiles" });
    } catch (error) {
      listenRef.current?.();
      listenRef.current = null;
      setImporting(false);
      setImportProgress(null);
      const message = error instanceof Error ? error.message : String(error);
      toast.error(t("modpacks.install.failed"), { description: message });
    }
  };

  const startAddVersion = () => setEditingVersionId("new");
  const startEditVersion = (version: ModpackVersion) => setEditingVersionId(version.id);
  const cancelEditVersion = () => setEditingVersionId(null);

  return (
    <Sheet open={open} onOpenChange={handleOpenChange} onOpenChangeComplete={onOpenChangeComplete}>
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-xl">
        <SheetHeader className="border-b pr-12">
          <SheetTitle className="truncate">{modpack.name}</SheetTitle>
          <SheetDescription>
            {isOwner
              ? t("modpacks.detail.bylineOwner", {
                  name: modpack.owner.name,
                  count: modpack.downloads,
                })
              : t("modpacks.detail.byline", { name: modpack.owner.name, count: modpack.downloads })}
          </SheetDescription>
        </SheetHeader>

        <ScrollArea scrollFade className="min-h-0 flex-1">
          <div className="grid gap-5 p-4">
            {/* Modpack info */}
            <ModpackImage
              alt={modpack.name}
              className="aspect-video w-full"
              iconClassName="size-8"
              src={modpack.imageUrl}
            />
            <p className="text-muted-foreground text-xs leading-relaxed whitespace-pre-wrap">
              {modpack.description || t("modpacks.noDescription")}
            </p>

            <Separator />

            {/* Versions */}
            <div className="grid gap-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="flex items-center gap-2 text-xs font-semibold">
                  <Boxes className="size-4" />
                  {t("modpacks.detail.versionsCount", { count: sortedVersions.length })}
                </h3>
                {isOwner && editingVersionId !== "new" && (
                  <Button size="sm" variant="outline" onClick={startAddVersion}>
                    <Plus /> {t("modpacks.detail.addVersion")}
                  </Button>
                )}
              </div>

              {isOwner && editingVersionId === "new" && (
                <ModpackVersionForm
                  key="new"
                  modpackSlug={modpack.slug}
                  profiles={profiles}
                  onCancel={cancelEditVersion}
                  onSuccess={cancelEditVersion}
                />
              )}

              {sortedVersions.length === 0 ? (
                <p className="text-muted-foreground text-xs">
                  {isOwner ? t("modpacks.detail.emptyOwner") : t("modpacks.detail.empty")}
                </p>
              ) : (
                sortedVersions.map((version) => {
                  if (editingVersionId === version.id) {
                    return (
                      <ModpackVersionForm
                        key={version.id}
                        existingVersion={{
                          gameVersion: version.gameVersion,
                          modConfigsUrl: version.modConfigsUrl,
                          modsString: version.modsString,
                          version: version.version,
                        }}
                        modpackSlug={modpack.slug}
                        profiles={profiles}
                        onCancel={cancelEditVersion}
                        onSuccess={cancelEditVersion}
                      />
                    );
                  }

                  const versionInstalled = installedVersionsSet.has(version.gameVersion);
                  const isNaming = installingVersionId === version.id;

                  return (
                    <div key={version.id} className="bg-card grid min-w-0 gap-3 border p-3">
                      <div className="flex items-center gap-3">
                        <div className="grid min-w-0 flex-1 gap-0.5">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                            <span className="font-mono text-xs font-medium">
                              v{version.version}
                            </span>
                            <span className="text-muted-foreground font-mono text-[10px]">
                              {t("modpacks.detail.forVs", { version: version.gameVersion })}
                            </span>
                          </div>
                          <span className="text-muted-foreground/70 text-[11px]">
                            {t("modpacks.downloads", { count: version.downloads })}
                          </span>
                        </div>

                        {isOwner && !isNaming && (
                          <div className="flex shrink-0 items-center gap-0.5">
                            <Button
                              aria-label={t("modpacks.detail.editVersion", {
                                version: version.version,
                              })}
                              size="icon-sm"
                              variant="ghost"
                              onClick={() => startEditVersion(version)}
                            >
                              <Pencil />
                            </Button>
                            <Button
                              aria-label={t("modpacks.detail.deleteVersion", {
                                version: version.version,
                              })}
                              className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                              size="icon-sm"
                              variant="ghost"
                              onClick={() => setDeleteVersionId(version.id)}
                            >
                              <Trash2 />
                            </Button>
                          </div>
                        )}

                        {!isNaming && (
                          <Button
                            className="shrink-0"
                            disabled={importing}
                            size="sm"
                            variant={versionInstalled ? "accent-primary" : "outline-accent-primary"}
                            onClick={() => handleInstallClick(version)}
                          >
                            <Download />
                            {versionInstalled
                              ? t("common.actions.install")
                              : t("modpacks.detail.needVs", { version: version.gameVersion })}
                          </Button>
                        )}
                      </div>

                      <ModpackModsList
                        modsString={version.modsString}
                        open={expandedModsVersionId === version.id}
                        onOpenChange={(next) => setExpandedModsVersionId(next ? version.id : null)}
                      />

                      {deleteVersionId === version.id && (
                        <DeleteVersionInline
                          modpackSlug={modpack.slug}
                          version={version.version}
                          onCancel={() => setDeleteVersionId(null)}
                        />
                      )}

                      {isNaming && (
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
                                onChange={(event) => setInstallName(event.target.value)}
                                onKeyDown={(event) => {
                                  if (event.key === "Enter" && !importing) {
                                    void handleConfirmInstall(version);
                                  }
                                  if (event.key === "Escape") cancelInstall();
                                }}
                              />
                            </div>
                            <Button
                              aria-label={t("modpacks.install.confirmAria")}
                              disabled={importing || !installName.trim()}
                              size="icon-sm"
                              variant="accent-primary"
                              onClick={() => void handleConfirmInstall(version)}
                            >
                              <CheckIcon />
                            </Button>
                            <Button
                              aria-label={t("modpacks.install.cancelAria")}
                              disabled={importing}
                              size="icon-sm"
                              variant="ghost"
                              onClick={cancelInstall}
                            >
                              <XIcon />
                            </Button>
                          </div>

                          {importProgress && <ImportProgressBar progress={importProgress} />}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
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
