import { useNavigate } from "@tanstack/react-router";
import { invoke } from "@tauri-apps/api/core";
import { Boxes, Plus } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
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
import { resolveInstalledVersionName, useInstalledVersions } from "@/hooks/use-installed-versions";
import type { ModpackItem } from "@/hooks/use-modpacks";
import { useTauriRunEvents } from "@/hooks/use-tauri-run-events";
import { authClient } from "@/lib/auth";
import type { ModpackManifestMod } from "@/lib/auth/plugins/modpacks";
import { errorMessage } from "@/lib/errors";
import { buildProfilePath, makeStringFolderSafe } from "@/lib/helpers";
import { toast } from "@/lib/notify";
import { useProfiles, useProfilesStore } from "@/stores/profiles";
import { useSettingsStore } from "@/stores/settings";

import ModpackImage from "./ModpackImage";
import ModpackVersionForm from "./ModpackVersionForm";
import ModpackVersionRow, { type ImportProgress, type ModpackVersion } from "./ModpackVersionRow";

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
  const { data: installedVersionRecords } = useInstalledVersions();
  const installedVersions = installedVersionRecords ?? [];
  const { mutateAsync: downloadVersion } = useDownloadVersion();

  const isOwner = user?.id === modpack.owner.id;
  const sortedVersions = modpack.modpackVersions.toSorted((a, b) => b.createdAt - a.createdAt);

  const [installingVersionId, setInstallingVersionId] = useState<string | null>(null);
  const [installName, setInstallName] = useState("");
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<ImportProgress | null>(null);
  const { subscribe, release } = useTauriRunEvents();

  // null = not editing, "new" = adding a version, otherwise the version id being edited.
  const [editingVersionId, setEditingVersionId] = useState<string | null>(null);
  const [deleteVersionId, setDeleteVersionId] = useState<string | null>(null);
  const [expandedModsVersionId, setExpandedModsVersionId] = useState<string | null>(null);

  const cancelInstall = () => {
    release();
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

    // Installing the same pack and version twice reuses the folder — importing
    // there would overwrite the profile that already lives in it.
    if (profiles.some((existing) => existing.path === profilePath)) {
      toast.error(t("profiles.store.pathExists", { path: profilePath }));
      return;
    }

    setImporting(true);
    setImportProgress(null);

    // Structured manifests (manifestVersion 1) let the Rust side download
    // exact files and verify sha256. Legacy versions fall back to modsString.
    let manifestMods: ModpackManifestMod[] | null = null;
    let manifestModConfigsUrl: string | null = null;
    let modConfigsSha256: string | null = null;
    try {
      const { data: manifest } = await authClient.getModpackManifest(modpack.slug, version.version);
      if (manifest && manifest.manifestVersion === 1) {
        manifestMods = manifest.mods;
        manifestModConfigsUrl = manifest.modConfigs?.url ?? null;
        modConfigsSha256 = manifest.modConfigs?.sha256 ?? null;
      }
    } catch {
      // Best-effort: older API deployments may not serve manifests yet.
    }

    // The manifest already hashes every mod file, so a structured cloud pack
    // arrives locked: the profile gets a lockfile and the backend verifies the
    // installed mods against it right after the import.
    const lockedMods = (manifestMods ?? [])
      .filter((mod) => typeof mod.sha256 === "string" && mod.sha256.length === 64)
      .map((mod) => ({
        modid: mod.modIdStr,
        version: mod.modVersion,
        filename: mod.filename || null,
        sha256: mod.sha256,
      }));
    const carriedLock =
      lockedMods.length > 0
        ? {
            lockVersion: 1,
            modpackSlug: modpack.slug,
            modpackVersion: version.version,
            mods: lockedMods,
          }
        : null;

    try {
      // A game version with only its Optimum build installed launches from
      // that build; a missing one is downloaded as usual.
      const resolvedVersion = resolveInstalledVersionName(installedVersions, version.gameVersion);
      if (!resolvedVersion) {
        await downloadVersion(version.gameVersion);
      }

      await invoke("initialize_game", { path: profilePath });

      // Tauri event names only allow alphanumerics, -, /, : and _ — no dots.
      const emitevent = `import-modpack-${modpack.slug.replace(/\./g, "-")}-${version.version.replace(/\./g, "-")}`;
      await subscribe<ImportProgress & { phase: string }>(emitevent, (payload) => {
        if (payload.phase === "downloading") {
          setImportProgress({
            current: payload.current,
            modid: payload.modid,
            total: payload.total,
            version: payload.version,
          });
        }
      });

      await invoke("import_profile", {
        params: {
          emitevent,
          lock: carriedLock,
          manifestMods,
          modConfigUrl: manifestModConfigsUrl ?? (version.modConfigsUrl || null),
          modConfigsSha256,
          modpackSlug: modpack.slug,
          modpackVersion: version.version,
          mods: version.modsString,
          name: installName,
          safeName,
          startParams: "",
          version: resolvedVersion ?? version.gameVersion,
        },
      });

      release();

      // Bump the download counter server-side.
      void authClient.downloadModpackVersion(modpack.slug, version.version);

      setInstallingVersionId(null);
      setImporting(false);
      setImportProgress(null);
      void loadProfiles();
      onOpenChange(false);
      void navigate({ to: "/profiles" });
    } catch (error) {
      release();
      setImporting(false);
      setImportProgress(null);
      const message = errorMessage(error);
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
                          changelog: version.changelog ?? null,
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

                  const versionInstalled =
                    resolveInstalledVersionName(installedVersions, version.gameVersion) !== null;
                  const isNaming = installingVersionId === version.id;

                  return (
                    <ModpackVersionRow
                      key={version.id}
                      deleteOpen={deleteVersionId === version.id}
                      importProgress={importProgress}
                      importing={importing}
                      installName={installName}
                      installed={versionInstalled}
                      isOwner={isOwner}
                      modpackSlug={modpack.slug}
                      modsOpen={expandedModsVersionId === version.id}
                      naming={isNaming}
                      version={version}
                      onCancelDelete={() => setDeleteVersionId(null)}
                      onCancelInstall={cancelInstall}
                      onConfirmInstall={() => void handleConfirmInstall(version)}
                      onDelete={() => setDeleteVersionId(version.id)}
                      onEdit={() => startEditVersion(version)}
                      onInstall={() => handleInstallClick(version)}
                      onInstallNameChange={setInstallName}
                      onModsOpenChange={(next) =>
                        setExpandedModsVersionId(next ? version.id : null)
                      }
                    />
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
