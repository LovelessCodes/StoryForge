import { useNavigate } from "@tanstack/react-router";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import {
  BoxIcon,
  CheckIcon,
  ChevronDownIcon,
  DownloadIcon,
  Pencil,
  PlusIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "@/components/ui/collapsible";
import { DialogClose, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Progress, ProgressIndicator, ProgressTrack } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { rootAlertDialogHandle, rootDialogHandle } from "@/handles";
import { useAppFolder } from "@/hooks/use-app-folder";
import { useAuthSession } from "@/hooks/use-auth-session";
import { useDownloadVersion } from "@/hooks/use-download-version";
import { useInstalledVersionNames } from "@/hooks/use-installed-versions";
import type { ModpackItem } from "@/hooks/use-modpacks";
import { authClient } from "@/lib/auth";
import { buildInstallationPath, makeStringFolderSafe } from "@/lib/utils";
import { useInstallations, useInstallationsStore } from "@/stores/installations";
import { useSettingsStore } from "@/stores/settings";

import { ModpackModItem } from "../items/modpack-mod-item";
import { CreateModpackVersionDialog } from "./create-modpack-version.dialog";
import { DeleteModpackVersionDialog } from "./delete-modpack.dialog";

type ImportProgress = {
  current: number;
  total: number;
  modid: string;
  version: string;
};

function parseMods(modsString: string): { modid: string; version: string }[] {
  return modsString
    .split(",")
    .map((entry) => {
      const [modid, version] = entry.trim().split("@");
      return { modid: modid?.trim() ?? "", version: version?.trim() ?? "" };
    })
    .filter((m) => m.modid && m.version);
}

export function ModpackDetailDialog({ modpack }: { modpack: ModpackItem }) {
  const { appFolder } = useAppFolder();
  const { installationsParent, installationsSubdir } = useSettingsStore();
  const { loadInstallations } = useInstallationsStore();
  const installedVersions = useInstalledVersionNames();
  const { mutateAsync: downloadVersion } = useDownloadVersion();
  const navigate = useNavigate();
  const { user } = useAuthSession();
  const { installations } = useInstallations();

  const isOwner = user?.id === modpack.owner.id;

  const sortedVersions = modpack.modpackVersions.toSorted((a, b) => b.createdAt - a.createdAt);

  // Install flow
  const [installingVersionId, setInstallingVersionId] = useState<string | null>(null);
  const [installName, setInstallName] = useState("");
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<ImportProgress | null>(null);
  const listenRef = useRef<UnlistenFn | null>(null);

  // Version CRUD state
  const [editingVersionId, setEditingVersionId] = useState<string | null>(null); // null = not editing, "new" = adding

  // Mod list expand state
  const [expandedModsVersionId, setExpandedModsVersionId] = useState<string | null>(null);

  // ── Install handlers ──

  const handleInstallClick = (v: (typeof sortedVersions)[number]) => {
    setInstallingVersionId(v.id);
    setInstallName(`${modpack.name} v${v.version}`);
  };

  const handleCancelInstall = () => {
    listenRef.current?.();
    listenRef.current = null;
    setInstallingVersionId(null);
    setInstallName("");
    setImporting(false);
    setImportProgress(null);
  };

  const handleConfirmInstall = async (version: (typeof sortedVersions)[number]) => {
    const safeName = makeStringFolderSafe(installName);
    const basePath = installationsParent ?? appFolder ?? "";
    const installPath = buildInstallationPath(basePath, safeName, installationsSubdir);

    setImporting(true);
    setImportProgress(null);

    try {
      if (!installedVersions.includes(version.gameVersion)) {
        await downloadVersion(version.gameVersion);
      }

      await invoke("initialize_game", { path: installPath });

      // Start listening for per-mod download progress
      // Tauri event names: only alphanumeric, -, /, :, _ — no dots
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

      // Also sanitize in the invoke payload — Rust side uses same event name
      await invoke("import_installation", {
        emitevent,
        modConfigUrl: version.modConfigsUrl || null,
        modpackSlug: modpack.slug,
        modpackVersion: version.version,
        mods: version.modsString,
        name: installName,
        safeName,
        startParams: "",
        version: version.gameVersion,
      });

      listenRef.current?.();
      listenRef.current = null;

      void authClient.downloadModpackVersion(modpack.slug, version.version);

      toast.success(`Installed ${installName}`);
      setInstallingVersionId(null);
      setImporting(false);
      setImportProgress(null);
      void loadInstallations();
      rootDialogHandle.close();
      void navigate({ to: "/installations" });
    } catch (e) {
      listenRef.current?.();
      listenRef.current = null;
      setImporting(false);
      setImportProgress(null);
      toast.error(`Failed to import modpack: ${e as Error}`);
    }
  };

  // ── Version CRUD handlers ──

  const startAdd = () => setEditingVersionId("new");
  const startEdit = (v: (typeof sortedVersions)[number]) => setEditingVersionId(v.id);
  const cancelEdit = () => setEditingVersionId(null);

  const handleDelete = (v: (typeof sortedVersions)[number]) => {
    rootAlertDialogHandle.openWithPayload(() => (
      <DeleteModpackVersionDialog
        modpackName={modpack.name}
        modpackSlug={modpack.slug}
        version={v.version}
      />
    ));
  };

  // ── Render ──

  return (
    <>
      <DialogClose />
      <div className="flex flex-col gap-4 px-1">
        {/* Header */}
        <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
          <img
            alt={modpack.name}
            className="bg-muted aspect-video w-full shrink-0 object-cover sm:w-48"
            src={
              modpack.imageUrl?.length
                ? modpack.imageUrl
                : "https://mods.vintagestory.at/web/img/mod-default.png"
            }
          />
          <div className="flex min-w-0 flex-col gap-1">
            <DialogHeader>
              <DialogTitle className="truncate">{modpack.name}</DialogTitle>
              <DialogDescription className="flex items-center gap-1.5">
                by{" "}
                {modpack.owner.image ? (
                  <img alt={modpack.owner.name} className="size-4" src={modpack.owner.image} />
                ) : null}
                <span>{modpack.owner.name}</span>
              </DialogDescription>
            </DialogHeader>
            <p className="text-muted-foreground text-sm">
              {modpack.description || "No description"}
            </p>
            <p className="text-muted-foreground/60 text-xs">
              {modpack.downloads.toLocaleString()} download
              {modpack.downloads !== 1 ? "s" : ""}
            </p>
          </div>
        </div>

        <Separator />

        {/* Versions */}
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <BoxIcon className="size-4" />
              Versions ({sortedVersions.length})
            </h3>
            {isOwner && editingVersionId !== "new" && (
              <Button onClick={startAdd} size="sm" variant="outline">
                <PlusIcon className="mr-1 size-3.5" />
                Add version
              </Button>
            )}
          </div>

          <div className="space-y-2">
            {/* Inline add/edit form */}
            {(editingVersionId === "new" || editingVersionId !== null) &&
              sortedVersions.find((v) => v.id === editingVersionId) === undefined && (
                <CreateModpackVersionDialog
                  installations={installations}
                  key="new"
                  modpackSlug={modpack.slug}
                  onCancel={cancelEdit}
                  onSuccess={cancelEdit}
                />
              )}

            {sortedVersions.map((v) => {
              const vsInstalled = installedVersions.includes(v.gameVersion);
              const isNaming = installingVersionId === v.id;
              const isEditing = editingVersionId === v.id;

              if (isEditing) {
                return (
                  <CreateModpackVersionDialog
                    existingVersion={{
                      gameVersion: v.gameVersion,
                      modConfigsUrl: v.modConfigsUrl,
                      modsString: v.modsString,
                      version: v.version,
                    }}
                    installations={installations}
                    key={v.id}
                    modpackSlug={modpack.slug}
                    onCancel={cancelEdit}
                    onSuccess={cancelEdit}
                  />
                );
              }

              return (
                <div className="bg-muted/50 flex flex-col gap-3 border px-4 py-3" key={v.id}>
                  <div className="flex items-center gap-3">
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span className="text-sm font-medium">v{v.version}</span>
                        <span className="text-muted-foreground font-mono text-xs">
                          for Vintage Story {v.gameVersion}
                        </span>
                      </div>
                      <span className="text-muted-foreground/60 text-xs">
                        {v.downloads.toLocaleString()} download
                        {v.downloads !== 1 ? "s" : ""}
                      </span>
                    </div>

                    {isOwner && !isNaming && (
                      <div className="flex shrink-0 items-center gap-0.5">
                        <Button onClick={() => startEdit(v)} size="icon-sm" variant="ghost">
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button
                          onClick={() => handleDelete(v)}
                          size="icon-sm"
                          variant="destructive-ghost"
                        >
                          <Trash2Icon className="size-3.5" />
                        </Button>
                      </div>
                    )}

                    {!isNaming && (
                      <Button
                        className="shrink-0"
                        disabled={importing}
                        onClick={() => handleInstallClick(v)}
                        size="sm"
                        variant={vsInstalled ? "default" : "outline"}
                      >
                        <DownloadIcon className="mr-1.5 size-3.5" />
                        {vsInstalled ? "Install" : `Need VS ${v.gameVersion}`}
                      </Button>
                    )}
                  </div>

                  {/* Collapsible mod list */}
                  {v.modsString && (
                    <Collapsible
                      onOpenChange={(open) => setExpandedModsVersionId(open ? v.id : null)}
                      open={expandedModsVersionId === v.id}
                    >
                      <CollapsibleTrigger className="text-muted-foreground hover:text-foreground flex cursor-pointer items-center gap-1 text-xs transition-colors">
                        <ChevronDownIcon className="size-3.5 transition-transform duration-200 data-panel-open:rotate-180" />
                        <span>
                          {(() => {
                            const count = v.modsString.split(",").filter(Boolean).length;
                            return `${count} mod${count !== 1 ? "s" : ""}`;
                          })()}
                        </span>
                      </CollapsibleTrigger>
                      <CollapsiblePanel>
                        <div className="space-y-1 px-2 py-2">
                          {parseMods(v.modsString).map((mod) => (
                            <ModpackModItem
                              key={mod.modid}
                              modid={mod.modid}
                              version={mod.version}
                            />
                          ))}
                        </div>
                      </CollapsiblePanel>
                    </Collapsible>
                  )}

                  {/* Name prompt — shown only after clicking Install */}
                  {isNaming && (
                    <div className="flex flex-col gap-2">
                      <div className="flex items-end gap-2">
                        <div className="flex flex-1 flex-col gap-1.5">
                          <label
                            className="text-muted-foreground text-xs font-medium"
                            htmlFor={`install-name-${v.id}`}
                          >
                            Installation name
                          </label>
                          <Input
                            autoFocus
                            className="h-8 text-sm"
                            disabled={importing}
                            id={`install-name-${v.id}`}
                            onChange={(e) => setInstallName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && !importing) void handleConfirmInstall(v);
                              if (e.key === "Escape") handleCancelInstall();
                            }}
                            placeholder="My installation"
                            value={installName}
                          />
                        </div>
                        <Button
                          className="shrink-0"
                          disabled={importing || !installName.trim()}
                          onClick={() => handleConfirmInstall(v)}
                          size="icon-sm"
                        >
                          <CheckIcon className="size-4" />
                        </Button>
                        <Button
                          className="shrink-0"
                          disabled={importing}
                          onClick={handleCancelInstall}
                          size="icon-sm"
                          variant="ghost"
                        >
                          <XIcon className="size-4" />
                        </Button>
                      </div>

                      {/* Progress bar during import */}
                      {importProgress && (
                        <div className="space-y-1">
                          <p className="text-muted-foreground text-xs">
                            Downloading mod {importProgress.current} of {importProgress.total}:{" "}
                            <span className="text-foreground font-medium">
                              {importProgress.modid}
                            </span>
                            <span className="text-muted-foreground">@{importProgress.version}</span>
                          </p>
                          <Progress
                            value={Math.round(
                              (importProgress.current / importProgress.total) * 100,
                            )}
                          >
                            <ProgressTrack>
                              <ProgressIndicator />
                            </ProgressTrack>
                          </Progress>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}
