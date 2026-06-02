import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import {
  BoxIcon,
  CheckIcon,
  DownloadIcon,
  Pencil,
  PlusIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { DialogClose, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress, ProgressIndicator, ProgressTrack } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { useAppFolder } from "@/hooks/use-app-folder";
import { useAuthSession } from "@/hooks/use-auth-session";
import { useDownloadVersion } from "@/hooks/use-download-version";
import { useInstalledVersionNames } from "@/hooks/use-installed-versions";
import type { ModpackItem } from "@/hooks/use-modpacks";
import { authClient } from "@/lib/auth";
import { buildInstallationPath, makeStringFolderSafe } from "@/lib/utils";
import { rootAlertDialogHandle, rootDialogHandle } from "@/routes/__root";
import { type Installation, useInstallations, useInstallationsStore } from "@/stores/installations";
import { useSettingsStore } from "@/stores/settings";

import { DeleteModpackVersionDialog } from "./delete-modpack.dialog";

type ImportProgress = {
  current: number;
  total: number;
  modid: string;
  version: string;
};

type VersionForm = {
  version: string;
  gameVersion: string;
  modsString: string;
  modConfigsUrl: string;
};

const emptyForm = (): VersionForm => ({
  gameVersion: "",
  modConfigsUrl: "",
  modsString: "",
  version: "",
});

export function ModpackDetailDialog({ modpack }: { modpack: ModpackItem }) {
  const { appFolder } = useAppFolder();
  const { installationsParent, installationsSubdir } = useSettingsStore();
  const { loadInstallations } = useInstallationsStore();
  const installedVersions = useInstalledVersionNames();
  const { mutateAsync: downloadVersion } = useDownloadVersion();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuthSession();
  const { installations } = useInstallations();

  const isOwner = user?.id === modpack.owner.id;

  const sortedVersions = [...modpack.modpackVersions].sort((a, b) => b.createdAt - a.createdAt);

  // Install flow
  const [installingVersionId, setInstallingVersionId] = useState<string | null>(null);
  const [installName, setInstallName] = useState("");
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<ImportProgress | null>(null);
  const listenRef = useRef<UnlistenFn | null>(null);

  // Version CRUD state
  const [editingVersionId, setEditingVersionId] = useState<string | null>(null); // null = not editing, "new" = adding
  const [form, setForm] = useState<VersionForm>(emptyForm());
  const [submitting, setSubmitting] = useState(false);
  const [uploadModConfig, setUploadModConfig] = useState(false);
  const [pickedInstallationId, setPickedInstallationId] = useState<number | null>(null);

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

  const startAdd = () => {
    setEditingVersionId("new");
    setForm(emptyForm());
  };

  const startEdit = (v: (typeof sortedVersions)[number]) => {
    setEditingVersionId(v.id);
    setForm({
      gameVersion: v.gameVersion,
      modConfigsUrl: v.modConfigsUrl,
      modsString: v.modsString,
      version: v.version,
    });
  };

  const cancelEdit = () => {
    setEditingVersionId(null);
    setForm(emptyForm());
    setUploadModConfig(false);
    setPickedInstallationId(null);
  };

  // ── Pick from installation ──

  const handlePickInstallation = async (inst: Installation) => {
    setPickedInstallationId(inst.id);
    setForm((f) => ({ ...f, gameVersion: inst.version }));
    try {
      const result = (await invoke("get_mods", { path: inst.path })) as {
        mods: { modid: string; version: string }[];
      };
      const modsString = result.mods.map((m) => `${m.modid}@${m.version}`).join(",");
      setForm((f) => ({ ...f, modsString }));
    } catch {
      toast.error("Failed to read installed mods");
    }
  };

  // ── Upload ModConfig as zip ──

  const uploadModConfigZip = async () => {
    if (!pickedInstallationId) return;
    const inst = installations.find((i) => i.id === pickedInstallationId);
    if (!inst) return;

    // Get zip bytes from the Rust backend
    const zipBytes = await invoke<number[]>("zip_modconfig", {
      installationPath: inst.path,
    });

    const blob = new Blob([new Uint8Array(zipBytes)], { type: "application/zip" });
    const data = new FormData();
    data.append("version", form.version);
    data.append("modConfig", blob, "ModConfig.zip");
    return await authClient.uploadModpackVersionConfig(modpack.slug, data);
  };

  // ── Submit ──

  const submitVersion = async () => {
    const missing: string[] = [];
    if (!form.version.trim()) missing.push("Version");
    if (!form.gameVersion.trim()) missing.push("Game version");
    if (missing.length > 0) {
      toast.error(`${missing.join(", ")} required`);
      return;
    }
    setSubmitting(true);
    let upload: Awaited<ReturnType<typeof uploadModConfigZip>> | undefined;
    try {
      // Upload ModConfig zip if requested
      if (uploadModConfig && pickedInstallationId) {
        try {
          upload = await uploadModConfigZip();
          if (upload?.data?.url) {
            toast.success("ModConfig uploaded");
          } else {
            throw new Error("Upload failed");
          }
        } catch {
          toast.error("Failed to upload ModConfig");
        }
      }
      if (editingVersionId === "new") {
        await authClient.createModpackVersion(
          modpack.slug,
          {
            gameVersion: form.gameVersion,
            modConfigsUrl: upload?.data?.url ?? form.modConfigsUrl,
            modsString: form.modsString,
            modpack: modpack.slug,
            version: form.version,
          },
          {
            onSuccess: async () => {
              await queryClient.invalidateQueries({
                queryKey: ["modpacks"],
              });
              toast.success(`Version ${form.version} created`);
            },
          },
        );
      } else if (editingVersionId) {
        await authClient.updateModpackVersion(
          modpack.slug,
          form.version,
          {
            gameVersion: form.gameVersion,
            modConfigsUrl: upload?.data?.url ?? form.modConfigsUrl,
            modsString: form.modsString,
          },
          {
            onSuccess: async () => {
              await queryClient.invalidateQueries({
                queryKey: ["modpacks"],
              });
              toast.success(`Version ${form.version} updated`);
            },
          },
        );
      }
      cancelEdit();
    } catch (e) {
      toast.error(`Failed to save version: ${e as Error}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = (v: (typeof sortedVersions)[number]) => {
    rootAlertDialogHandle.openWithPayload(() => (
      <DeleteModpackVersionDialog
        modpackName={modpack.name}
        modpackSlug={modpack.slug}
        onDeleted={() =>
          queryClient.invalidateQueries({
            queryKey: ["modpacks"],
          })
        }
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
            className="bg-muted aspect-video w-full shrink-0 rounded-lg object-cover sm:w-48"
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
                  <img
                    alt={modpack.owner.name}
                    className="size-4 rounded-full"
                    src={modpack.owner.image}
                  />
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
                <VersionFormRow
                  form={form}
                  installations={installations}
                  isNew={editingVersionId === "new"}
                  onChange={setForm}
                  onCancel={cancelEdit}
                  onSubmit={submitVersion}
                  onPickInstallation={handlePickInstallation}
                  onToggleUpload={setUploadModConfig}
                  pickedInstallationId={pickedInstallationId}
                  submitting={submitting}
                  uploadModConfig={uploadModConfig}
                />
              )}

            {sortedVersions.map((v) => {
              const vsInstalled = installedVersions.includes(v.gameVersion);
              const isNaming = installingVersionId === v.id;
              const isEditing = editingVersionId === v.id;

              if (isEditing) {
                return (
                  <VersionFormRow
                    form={form}
                    installations={installations}
                    isNew={false}
                    key={v.id}
                    onChange={setForm}
                    onCancel={cancelEdit}
                    onSubmit={submitVersion}
                    onPickInstallation={handlePickInstallation}
                    onToggleUpload={setUploadModConfig}
                    pickedInstallationId={pickedInstallationId}
                    submitting={submitting}
                    uploadModConfig={uploadModConfig}
                  />
                );
              }

              return (
                <div
                  className="bg-muted/50 flex flex-col gap-3 rounded-md border px-4 py-3"
                  key={v.id}
                >
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

/** Inline form for adding or editing a modpack version. */
function VersionFormRow({
  form,
  isNew,
  onChange,
  onCancel,
  onSubmit,
  submitting,
  installations,
  pickedInstallationId,
  uploadModConfig,
  onPickInstallation,
  onToggleUpload,
}: {
  form: VersionForm;
  isNew: boolean;
  onChange: (f: VersionForm) => void;
  onCancel: () => void;
  onSubmit: () => void;
  submitting: boolean;
  installations: Installation[];
  pickedInstallationId: number | null;
  uploadModConfig: boolean;
  onPickInstallation: (inst: Installation) => void;
  onToggleUpload: (v: boolean) => void;
}) {
  return (
    <div className="bg-muted/50 flex flex-col gap-3 rounded-md border px-4 py-3">
      <div className="flex items-center gap-1">
        <span className="text-sm font-semibold">
          {isNew ? "New version" : `Edit v${form.version}`}
        </span>
      </div>

      {/* Pick from installation — new versions only */}
      {isNew && installations.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <Label className="text-muted-foreground text-xs">Pick from installation</Label>
          <Select
            onValueChange={(v) => {
              const inst = installations.find((i) => i.id === Number(v));
              if (inst) onPickInstallation(inst);
            }}
            value={pickedInstallationId?.toString() ?? ""}
          >
            <SelectTrigger className="h-8 text-sm">
              <SelectValue placeholder="Select an installation…" />
              {pickedInstallationId
                ? (installations.find((i) => i.id === pickedInstallationId)?.name ?? "Selected")
                : null}
            </SelectTrigger>
            <SelectContent align="start" alignItemWithTrigger={false}>
              {installations.map((inst) => (
                <SelectItem key={inst.id} value={inst.id.toString()}>
                  {inst.name}{" "}
                  <span className="text-muted-foreground text-xs">(VS {inst.version})</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label className="text-muted-foreground text-xs">Version</Label>
          <Input
            className="h-8 text-sm"
            disabled={!isNew}
            onChange={(e) => onChange({ ...form, version: e.target.value })}
            placeholder="1.0.0"
            value={form.version}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-muted-foreground text-xs">Game version</Label>
          <Input
            className="h-8 text-sm"
            onChange={(e) => onChange({ ...form, gameVersion: e.target.value })}
            placeholder="1.20.4"
            value={form.gameVersion}
          />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label className="text-muted-foreground text-xs">Mods string</Label>
        <Textarea
          className="font-mono text-xs"
          onChange={(e) => onChange({ ...form, modsString: e.target.value })}
          placeholder="modid@version,modid@version,..."
          rows={3}
          value={form.modsString}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label className="text-muted-foreground text-xs">Mod configs URL</Label>
        <Input
          className="h-8 text-sm"
          onChange={(e) => onChange({ ...form, modConfigsUrl: e.target.value })}
          placeholder="https://..."
          value={form.modConfigsUrl}
        />
      </div>

      {/* Upload ModConfig checkbox — when picking from installation */}
      {pickedInstallationId && (
        <label className="flex items-center gap-2 text-xs">
          <input
            checked={uploadModConfig}
            className="size-3.5"
            onChange={(e) => onToggleUpload(e.target.checked)}
            type="checkbox"
          />
          Upload ModConfig folder from installation
        </label>
      )}

      <div className="flex items-center justify-end gap-2">
        <Button disabled={submitting} onClick={onCancel} size="sm" variant="ghost">
          Cancel
        </Button>
        <Button disabled={submitting} onClick={onSubmit} size="sm">
          {submitting ? "Saving…" : isNew ? "Create" : "Save"}
        </Button>
      </div>
    </div>
  );
}
