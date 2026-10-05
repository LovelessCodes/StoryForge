import { useMutation, useQueryClient } from "@tanstack/react-query";
import { open } from "@tauri-apps/plugin-dialog";
import { FolderOpenIcon } from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { useAppFolder } from "@/hooks/use-app-folder";
import { installedVersionsQueryKey } from "@/hooks/use-installed-versions";
import { logToFile } from "@/lib/logger";
import { toast } from "@/lib/notify";
import { useProfilesStore } from "@/stores/profiles";
import { type SetParentConfigProps, useSettingsStore } from "@/stores/settings";

type ParentField = "profilesParent" | "versionsParent";
type DialogChoice = "keep" | "delete" | "move";

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function ParentRow({
  browseDisabled,
  disabled,
  hint,
  id,
  label,
  onBrowse,
  value,
}: {
  browseDisabled: boolean;
  disabled: boolean;
  hint: string;
  id: ParentField;
  label: string;
  onBrowse: () => void;
  value: string;
}) {
  const { t } = useTranslation();
  return (
    <div className="grid gap-1.5">
      <label className="text-xs font-medium" htmlFor={id}>
        {label}
      </label>
      <div className="flex gap-2">
        <Input
          className="font-mono text-[11px]"
          disabled={disabled}
          id={id}
          readOnly
          value={value}
        />
        <Button disabled={browseDisabled} onClick={onBrowse} variant="outline">
          {t("common.actions.browse")}
        </Button>
      </div>
      <p className="text-muted-foreground text-[11px]">{hint}</p>
    </div>
  );
}

export default function DataFoldersCard() {
  const { t } = useTranslation();
  const { appFolder } = useAppFolder();
  const profilesParent = useSettingsStore((s) => s.profilesParent);
  const versionsParent = useSettingsStore((s) => s.versionsParent);
  const profilesSubdir = useSettingsStore((s) => s.profilesSubdir);
  const versionsSubdir = useSettingsStore((s) => s.versionsSubdir);
  const setProfilesParent = useSettingsStore((s) => s.setProfilesParent);
  const setVersionsParent = useSettingsStore((s) => s.setVersionsParent);
  const updateProfilesParent = useProfilesStore((s) => s.updateParent);
  const removeAllProfiles = useProfilesStore((s) => s.removeAll);

  const queryClient = useQueryClient();
  // Local override for the switch; null = derive from the store so the value
  // is right even if the settings store finishes loading after mount.
  const [appDirOverride, setAppDirOverride] = useState<boolean | null>(null);
  const useAppDirectory = appDirOverride ?? (profilesParent === null && versionsParent === null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const pendingRef = useRef<{ field: ParentField | "both"; path: string | null } | null>(null);

  function parentHint(useAppDirectory: boolean, value: string | null, subdir: string): string {
    if (useAppDirectory) {
      return t("settings.folders.hintAppDirectory", { subdir });
    }
    if (value === null) return t("settings.folders.hintDefault");
    return t("settings.folders.hintInside", { subdir });
  }

  const setProfiles = useMutation({
    mutationFn: ({ path, config }: { path: string | null; config?: SetParentConfigProps }) =>
      setProfilesParent(path, config),
    onMutate: (variables) => {
      if (variables.config?.moveCurrentData) {
        toast.loading(t("settings.folders.toast.profilesMoving"), { id: "settings-save" });
      } else if (variables.config?.deleteCurrentData) {
        toast.loading(t("settings.folders.toast.profilesDeleting"), { id: "settings-save" });
      } else {
        toast.loading(t("settings.folders.toast.profilesSetting"), { id: "settings-save" });
      }
    },
    onError: (error, variables) => {
      if (variables.config?.moveCurrentData) {
        toast.error(t("settings.folders.toast.profilesMoveFailed", { message: messageOf(error) }), {
          id: "settings-save",
        });
      } else if (variables.config?.deleteCurrentData) {
        toast.error(
          t("settings.folders.toast.profilesDeleteFailed", { message: messageOf(error) }),
          {
            id: "settings-save",
          },
        );
      } else {
        toast.error(t("settings.folders.toast.profilesSetFailed", { message: messageOf(error) }), {
          id: "settings-save",
        });
      }
    },
    onSuccess: async (_, variables) => {
      toast.dismiss("settings-save");
      if (variables.config?.moveCurrentData) {
        updateProfilesParent(variables.path ?? appFolder ?? "");
      } else if (variables.config?.deleteCurrentData) {
        removeAllProfiles();
      }
      void queryClient.invalidateQueries({ queryKey: ["saves"] });
    },
  });

  const setVersions = useMutation({
    mutationFn: ({ path, config }: { path: string | null; config?: SetParentConfigProps }) =>
      setVersionsParent(path, config),
    onMutate: (variables) => {
      if (variables.config?.moveCurrentData) {
        toast.loading(t("settings.folders.toast.versionsMoving"), { id: "settings-save" });
      } else if (variables.config?.deleteCurrentData) {
        toast.loading(t("settings.folders.toast.versionsDeleting"), { id: "settings-save" });
      } else {
        toast.loading(t("settings.folders.toast.versionsSetting"), { id: "settings-save" });
      }
    },
    onError: (error, variables) => {
      if (variables.config?.moveCurrentData) {
        toast.error(t("settings.folders.toast.versionsMoveFailed", { message: messageOf(error) }), {
          id: "settings-save",
        });
      } else if (variables.config?.deleteCurrentData) {
        toast.error(
          t("settings.folders.toast.versionsDeleteFailed", { message: messageOf(error) }),
          {
            id: "settings-save",
          },
        );
      } else {
        toast.error(t("settings.folders.toast.versionsSetFailed", { message: messageOf(error) }), {
          id: "settings-save",
        });
      }
    },
    onSuccess: async () => {
      toast.dismiss("settings-save");
      void queryClient.invalidateQueries({ queryKey: installedVersionsQueryKey() });
    },
  });

  const busy = setProfiles.isPending || setVersions.isPending;

  async function handleBrowse(field: ParentField) {
    const selected = await open({
      directory: true,
      multiple: false,
      title:
        field === "profilesParent"
          ? t("settings.folders.browseProfilesTitle")
          : t("settings.folders.browseVersionsTitle"),
    });
    if (typeof selected === "string") {
      pendingRef.current = { field, path: selected };
      setDialogOpen(true);
    }
  }

  async function handleDialogChoice(choice: DialogChoice) {
    const pending = pendingRef.current;
    setDialogOpen(false);
    pendingRef.current = null;
    if (!pending) return;

    await logToFile(
      "INFO ",
      `[settings] Folder change: field=${pending.field} choice=${choice} path=${pending.path ?? "app-data-dir"}`,
    );

    const config: SetParentConfigProps =
      choice === "move"
        ? { deleteCurrentData: false, moveCurrentData: true }
        : choice === "delete"
          ? { deleteCurrentData: true, moveCurrentData: false }
          : { deleteCurrentData: false, moveCurrentData: false };

    if (pending.field === "profilesParent" || pending.field === "both") {
      setProfiles.mutate({ path: pending.path, config });
    }
    if (pending.field === "versionsParent" || pending.field === "both") {
      setVersions.mutate({ path: pending.path, config });
    }
  }

  function handleUseAppDirectory(checked: boolean) {
    setAppDirOverride(checked);
    if (checked && (profilesParent !== null || versionsParent !== null)) {
      pendingRef.current = { field: "both", path: null };
      setDialogOpen(true);
    }
  }

  function handleDialogOpenChange(next: boolean) {
    setDialogOpen(next);
    if (!next) {
      // Cancelling the app-data-dir switch must not leave it showing paths
      // that were never applied.
      if (pendingRef.current?.field === "both") setAppDirOverride(null);
      pendingRef.current = null;
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FolderOpenIcon className="size-4" />
          {t("settings.folders.title")}
        </CardTitle>
        <CardDescription>{t("settings.folders.description")}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="flex items-center justify-between gap-4">
          <div className="grid gap-0.5">
            <span className="text-xs font-medium">{t("settings.folders.useAppDirectory")}</span>
            <span className="text-muted-foreground text-[11px]">
              {t("settings.folders.useAppDirectoryDescription")}
            </span>
          </div>
          <Switch
            aria-label={t("settings.folders.useAppDirectory")}
            checked={useAppDirectory}
            disabled={busy}
            onCheckedChange={handleUseAppDirectory}
          />
        </div>

        <ParentRow
          browseDisabled={useAppDirectory || busy}
          disabled={useAppDirectory}
          hint={parentHint(useAppDirectory, profilesParent, profilesSubdir)}
          id="profilesParent"
          label={t("settings.folders.profilesLabel")}
          onBrowse={() => void handleBrowse("profilesParent")}
          value={useAppDirectory ? (appFolder ?? "") : (profilesParent ?? "")}
        />

        <ParentRow
          browseDisabled={useAppDirectory || busy}
          disabled={useAppDirectory}
          hint={parentHint(useAppDirectory, versionsParent, versionsSubdir)}
          id="versionsParent"
          label={t("settings.folders.versionsLabel")}
          onBrowse={() => void handleBrowse("versionsParent")}
          value={useAppDirectory ? (appFolder ?? "") : (versionsParent ?? "")}
        />
      </CardContent>

      <Sheet onOpenChange={handleDialogOpenChange} open={dialogOpen}>
        <SheetContent className="w-full gap-0 p-0 sm:max-w-sm" side="right">
          <SheetHeader className="border-b">
            <SheetTitle>{t("settings.folders.dialog.title")}</SheetTitle>
            <SheetDescription>{t("settings.folders.dialog.description")}</SheetDescription>
          </SheetHeader>
          <div className="grid gap-2 p-4">
            <Button onClick={() => void handleDialogChoice("keep")} variant="outline">
              {t("settings.folders.dialog.keep")}
            </Button>
            <Button onClick={() => void handleDialogChoice("move")} variant="accent-primary">
              {t("settings.folders.dialog.copy")}
            </Button>
            <Button onClick={() => void handleDialogChoice("delete")} variant="destructive">
              {t("settings.folders.dialog.delete")}
            </Button>
          </div>
          <SheetFooter className="border-t">
            <Button onClick={() => handleDialogOpenChange(false)} variant="ghost">
              {t("common.actions.cancel")}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </Card>
  );
}
