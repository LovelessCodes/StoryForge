import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { invoke } from "@tauri-apps/api/core";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { save } from "@tauri-apps/plugin-dialog";
import { formatDistanceToNow } from "date-fns";
import {
  Archive,
  Camera,
  Copy,
  Ellipsis,
  FileText,
  FolderOpen,
  IdCard,
  Link2,
  Lock,
  Package,
  Pencil,
  ScrollText,
  Share2,
  Star,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { notify } from "@/components/ui/toast";
import { useInstalledVersionNames } from "@/hooks/use-installed-versions";
import { useDateLocale } from "@/lib/i18n/date-locale";
import { toast } from "@/lib/notify";
import { useProfilesStore, type Profile } from "@/stores/profiles";
import { useSettingsStore } from "@/stores/settings";

import ProfileBackupsSheet from "./ProfileBackupsSheet";
import { PROFILE_ICON_BASE } from "./ProfileIconPicker";
import ProfileLogsSheet from "./ProfileLogsSheet";
import ProfilePackSheet from "./ProfilePackSheet";
import ProfileScreenshotsSheet from "./ProfileScreenshotsSheet";

interface ProfileRowProps {
  profile: Profile;
  isActive: boolean;
  onEdit: (profile: Profile) => void;
}

export default function ProfileRow({ profile, isActive, onEdit }: ProfileRowProps) {
  const { t } = useTranslation();
  const dateLocale = useDateLocale();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const installedNames = useInstalledVersionNames();
  const versionInstalled = installedNames.includes(profile.version);
  const setActiveProfileId = useSettingsStore((s) => s.setActiveProfileId);
  const activeProfileId = useSettingsStore((s) => s.activeProfileId);
  const { loadProfiles } = useProfilesStore();

  const [logsOpen, setLogsOpen] = useState(false);
  const [backupsOpen, setBackupsOpen] = useState(false);
  const [packOpen, setPackOpen] = useState(false);
  const [screenshotsOpen, setScreenshotsOpen] = useState(false);
  const [cloneOpen, setCloneOpen] = useState(false);
  const [cloneName, setCloneName] = useState(
    t("profiles.clone.defaultName", { name: profile.name }),
  );
  const [cloneBusy, setCloneBusy] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);

  function switchToThis() {
    setActiveProfileId(profile.id);
  }

  function openMods(kind: "mods" | "config") {
    switchToThis();
    void navigate({ to: kind === "mods" ? "/mods" : "/config" });
  }

  async function exportFile() {
    try {
      const path = await save({
        defaultPath: `${profile.name}.sfprofile.json`,
        filters: [{ name: t("profiles.export.filterName"), extensions: ["json"] }],
      });
      if (!path) return;
      await invoke("export_profile_file", { id: profile.id, path });
      toast.success(t("profiles.export.exported"));
    } catch (error) {
      toast.error(t("profiles.export.failed"), { description: String(error) });
    }
  }

  async function copyShareCode() {
    try {
      const code = await invoke<string>("export_profile_code", { id: profile.id });
      await writeText(code);
      toast.success(t("profiles.export.shareCodeCopied"));
    } catch (error) {
      toast.error(t("profiles.export.shareCodeFailed"), { description: String(error) });
    }
  }

  async function doClone() {
    const name = cloneName.trim();
    if (name.length < 2) return;
    setCloneBusy(true);
    try {
      await invoke("clone_profile", { id: profile.id, name });
      await loadProfiles();
      setCloneOpen(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(t("profiles.clone.failed"), { description: message });
    } finally {
      setCloneBusy(false);
    }
  }

  async function doDelete() {
    if (isActive || activeProfileId === profile.id) {
      toast.error(t("profiles.delete.switchFirst"));
      return;
    }
    setDeleteBusy(true);
    try {
      if (profile.external) {
        // The folder belongs to the user's game installation — only stop
        // managing it, never touch the data.
        await invoke("unregister_external_profile", { path: profile.path });
        await loadProfiles();
        setDeleteOpen(false);
        return;
      }
      const result = await invoke<{ archive_name: string }>("soft_delete_profile", {
        id: profile.id,
        activeId: activeProfileId,
      });
      await loadProfiles();
      void queryClient.invalidateQueries({ queryKey: ["deleted-profiles"] });
      setDeleteOpen(false);
      notify(`profile-deleted-${result.archive_name}`, {
        type: "info",
        title: t("profiles.delete.deleted", { name: profile.name }),
        description: t("profiles.delete.description"),
        timeout: 10000,
        actionProps: {
          children: t("profiles.delete.undo"),
          onClick: () => {
            void invoke("restore_deleted_profile", { archiveName: result.archive_name }).then(
              async () => {
                await loadProfiles();
                void queryClient.invalidateQueries({ queryKey: ["deleted-profiles"] });
                void notify(`profile-restored-${result.archive_name}`, {
                  type: "success",
                  title: t("profiles.delete.restored", { name: profile.name }),
                  timeout: 4000,
                });
              },
            );
          },
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(t("profiles.delete.failed"), { description: message });
    } finally {
      setDeleteBusy(false);
    }
  }

  const meta: string[] = [`v${profile.version}`, profile.sizeDisplay];
  meta.push(
    profile.lastTimePlayed > 0
      ? t("profiles.row.played", {
          time: formatDistanceToNow(new Date(profile.lastTimePlayed), {
            addSuffix: true,
            locale: dateLocale,
          }),
        })
      : t("profiles.row.neverPlayed"),
  );

  return (
    <div className="bg-card hover:bg-muted/40 flex items-center gap-3 p-3 transition-colors">
      <div className="bg-muted/50 flex size-10 shrink-0 items-center justify-center border">
        {profile.icon ? (
          <img
            alt=""
            className="size-8 object-contain"
            src={`${PROFILE_ICON_BASE}/${profile.icon}`}
          />
        ) : (
          <IdCard className="text-muted-foreground size-5" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-medium">{profile.name}</span>
          {isActive && (
            <Badge className="border-accent-primary/40 bg-accent-primary/10 text-accent-primary h-4 px-1.5 text-[10px]">
              {t("profiles.row.active")}
            </Badge>
          )}
          {profile.favorite && (
            <Star className="size-3 shrink-0 fill-[var(--color-accent-amber)] text-[var(--color-accent-amber)]" />
          )}
          {profile.modpackSlug && (
            <Badge variant="outline" className="h-4 px-1.5 text-[10px]">
              {profile.modpackSlug} v{profile.modpackVersion}
            </Badge>
          )}
          {profile.external && (
            <Badge
              variant="outline"
              className="h-4 border-[var(--color-info)]/40 px-1.5 text-[10px] text-[var(--color-info)]"
            >
              {t("profiles.row.existingData")}
            </Badge>
          )}
        </div>
        <div className="text-muted-foreground mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px]">
          {meta.map((item) => (
            <span key={item}>{item}</span>
          ))}
          {!versionInstalled && (
            <span className="text-[var(--color-warning)]">{t("profiles.row.notInstalled")}</span>
          )}
        </div>
      </div>

      {!isActive && (
        <Button size="sm" variant="outline" onClick={switchToThis}>
          {t("profiles.row.switch")}
        </Button>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              aria-label={t("profiles.row.actionsFor", { name: profile.name })}
              size="icon-sm"
              variant="ghost"
            />
          }
        >
          <Ellipsis />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => onEdit(profile)} className="text-nowrap">
            <Pencil /> {t("common.actions.edit")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => openMods("mods")} className="text-nowrap">
            <Package /> {t("profiles.row.manageMods")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => openMods("config")} className="text-nowrap">
            <FileText /> {t("profiles.row.configureMods")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setPackOpen(true)} className="text-nowrap">
            <Lock /> {t("profiles.row.packLock")}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => {
              void invoke("reveal_in_file_explorer", { path: profile.path }).catch((error) =>
                toast.error(t("profiles.row.openFolderFailed"), { description: String(error) }),
              );
            }}
          >
            <FolderOpen /> {t("common.actions.openFolder")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setLogsOpen(true)} className="text-nowrap">
            <ScrollText /> {t("profiles.row.viewLogs")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setBackupsOpen(true)} className="text-nowrap">
            <Archive /> {t("profiles.row.backups")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setScreenshotsOpen(true)} className="text-nowrap">
            <Camera /> {t("profiles.screenshots.menu")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => void exportFile()} className="text-nowrap">
            <Share2 /> {t("profiles.row.exportFile")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => void copyShareCode()} className="text-nowrap">
            <Link2 /> {t("profiles.row.copyShareCode")}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => {
              setCloneName(t("profiles.clone.defaultName", { name: profile.name }));
              setCloneOpen(true);
            }}
            className="text-nowrap"
          >
            <Copy /> {t("profiles.clone.menu")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={isActive}
            title={isActive ? t("profiles.row.switchFirstTitle") : undefined}
            variant="destructive"
            onClick={() => setDeleteOpen(true)}
            className="text-nowrap"
          >
            <Trash2 />{" "}
            {isActive
              ? t("profiles.row.deleteCurrent")
              : profile.external
                ? t("profiles.delete.removeAction")
                : t("common.actions.delete")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ProfileLogsSheet open={logsOpen} onOpenChange={setLogsOpen} profile={profile} />
      <ProfileBackupsSheet open={backupsOpen} onOpenChange={setBackupsOpen} profile={profile} />
      <ProfileScreenshotsSheet
        open={screenshotsOpen}
        onOpenChange={setScreenshotsOpen}
        profile={profile}
      />

      <ProfilePackSheet profile={profile} open={packOpen} onOpenChange={setPackOpen} />

      <Sheet open={cloneOpen} onOpenChange={(next) => !cloneBusy && setCloneOpen(next)}>
        <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-sm">
          <SheetHeader className="border-b">
            <SheetTitle>{t("profiles.clone.title", { name: profile.name })}</SheetTitle>
            <SheetDescription>{t("profiles.clone.description")}</SheetDescription>
          </SheetHeader>
          <div className="grid gap-1.5 p-4">
            <label className="text-xs font-medium" htmlFor="clone-name">
              {t("profiles.clone.newName")}
            </label>
            <Input
              id="clone-name"
              value={cloneName}
              onChange={(event) => setCloneName(event.target.value)}
            />
          </div>
          <SheetFooter className="border-t">
            <Button
              variant="accent-primary"
              disabled={cloneBusy || cloneName.trim().length < 2}
              onClick={() => void doClone()}
            >
              {cloneBusy ? t("profiles.clone.busy") : t("profiles.clone.submit")}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <Sheet open={deleteOpen} onOpenChange={(next) => !deleteBusy && setDeleteOpen(next)}>
        <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-sm">
          <SheetHeader className="border-b">
            <SheetTitle>
              {profile.external
                ? t("profiles.delete.removeTitle", { name: profile.name })
                : t("profiles.delete.deleteTitle", { name: profile.name })}
            </SheetTitle>
            <SheetDescription>
              {profile.external
                ? t("profiles.delete.externalDescription")
                : t("profiles.delete.folderDescription")}
            </SheetDescription>
          </SheetHeader>
          <SheetFooter className="border-t">
            <Button variant="destructive" disabled={deleteBusy} onClick={() => void doDelete()}>
              {deleteBusy
                ? profile.external
                  ? t("profiles.delete.removing")
                  : t("profiles.delete.deleting")
                : profile.external
                  ? t("profiles.delete.removeAction")
                  : t("profiles.delete.moveToTrash")}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
