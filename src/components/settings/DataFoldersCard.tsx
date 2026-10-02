import { useMutation, useQueryClient } from "@tanstack/react-query";
import { open } from "@tauri-apps/plugin-dialog";
import { FolderOpenIcon } from "lucide-react";
import { useRef, useState } from "react";

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

function parentHint(useAppDirectory: boolean, value: string | null, subdir: string): string {
  if (useAppDirectory) {
    return `Using the app data directory. A "${subdir}" folder is created inside it.`;
  }
  if (value === null) return "Defaults to the app data directory.";
  return `A "${subdir}" folder is created inside this directory.`;
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
          Browse
        </Button>
      </div>
      <p className="text-muted-foreground text-[11px]">{hint}</p>
    </div>
  );
}

export default function DataFoldersCard() {
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

  const setProfiles = useMutation({
    mutationFn: ({ path, config }: { path: string | null; config?: SetParentConfigProps }) =>
      setProfilesParent(path, config),
    onMutate: (variables) => {
      if (variables.config?.moveCurrentData) {
        toast.loading("Moving profiles folder...", { id: "settings-save" });
      } else if (variables.config?.deleteCurrentData) {
        toast.loading("Deleting profiles data...", { id: "settings-save" });
      } else {
        toast.loading("Setting profiles folder...", { id: "settings-save" });
      }
    },
    onError: (error, variables) => {
      if (variables.config?.moveCurrentData) {
        toast.error(`Failed to move profiles folder: ${messageOf(error)}`, {
          id: "settings-save",
        });
      } else if (variables.config?.deleteCurrentData) {
        toast.error(`Failed to delete profiles data: ${messageOf(error)}`, {
          id: "settings-save",
        });
      } else {
        toast.error(`Failed to set profiles folder: ${messageOf(error)}`, {
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
        toast.loading("Moving versions folder...", { id: "settings-save" });
      } else if (variables.config?.deleteCurrentData) {
        toast.loading("Deleting versions data...", { id: "settings-save" });
      } else {
        toast.loading("Setting versions folder...", { id: "settings-save" });
      }
    },
    onError: (error, variables) => {
      if (variables.config?.moveCurrentData) {
        toast.error(`Failed to move versions folder: ${messageOf(error)}`, {
          id: "settings-save",
        });
      } else if (variables.config?.deleteCurrentData) {
        toast.error(`Failed to delete versions data: ${messageOf(error)}`, {
          id: "settings-save",
        });
      } else {
        toast.error(`Failed to set versions folder: ${messageOf(error)}`, {
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
          ? "Select Profiles Parent Directory"
          : "Select Versions Parent Directory",
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
          Data folders
        </CardTitle>
        <CardDescription>
          Where Story Forge keeps profiles and game versions. Defaults to the app data directory.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="flex items-center justify-between gap-4">
          <div className="grid gap-0.5">
            <span className="text-xs font-medium">Use app data directory</span>
            <span className="text-muted-foreground text-[11px]">
              Store profiles and versions inside Story Forge&apos;s own folder.
            </span>
          </div>
          <Switch
            aria-label="Use app data directory"
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
          label="Profiles parent directory"
          onBrowse={() => void handleBrowse("profilesParent")}
          value={useAppDirectory ? (appFolder ?? "") : (profilesParent ?? "")}
        />

        <ParentRow
          browseDisabled={useAppDirectory || busy}
          disabled={useAppDirectory}
          hint={parentHint(useAppDirectory, versionsParent, versionsSubdir)}
          id="versionsParent"
          label="Versions parent directory"
          onBrowse={() => void handleBrowse("versionsParent")}
          value={useAppDirectory ? (appFolder ?? "") : (versionsParent ?? "")}
        />
      </CardContent>

      <Sheet onOpenChange={handleDialogOpenChange} open={dialogOpen}>
        <SheetContent className="w-full gap-0 p-0 sm:max-w-sm" side="right">
          <SheetHeader className="border-b">
            <SheetTitle>How do you want to handle existing data?</SheetTitle>
            <SheetDescription>
              Data currently lives in the folder you are leaving. This cannot be undone once
              deleted.
            </SheetDescription>
          </SheetHeader>
          <div className="grid gap-2 p-4">
            <Button onClick={() => void handleDialogChoice("keep")} variant="outline">
              Keep current data (do not move or delete)
            </Button>
            <Button onClick={() => void handleDialogChoice("move")} variant="accent-primary">
              Copy current data to new location
            </Button>
            <Button onClick={() => void handleDialogChoice("delete")} variant="destructive">
              Delete current data from old location
            </Button>
          </div>
          <SheetFooter className="border-t">
            <Button onClick={() => handleDialogOpenChange(false)} variant="ghost">
              Cancel
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </Card>
  );
}
