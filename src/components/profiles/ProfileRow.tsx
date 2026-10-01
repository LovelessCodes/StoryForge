import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { invoke } from "@tauri-apps/api/core";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { save } from "@tauri-apps/plugin-dialog";
import { formatDistanceToNow } from "date-fns";
import {
  Copy,
  Ellipsis,
  FileText,
  FolderOpen,
  IdCard,
  Link2,
  Package,
  Pencil,
  ScrollText,
  Share2,
  Star,
  Trash2,
} from "lucide-react";
import { useState } from "react";

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
import { toast } from "@/lib/notify";
import { useProfilesStore, type Profile } from "@/stores/profiles";
import { useSettingsStore } from "@/stores/settings";

import { PROFILE_ICON_BASE } from "./ProfileIconPicker";
import ProfileLogsSheet from "./ProfileLogsSheet";

interface ProfileRowProps {
  profile: Profile;
  isActive: boolean;
  onEdit: (profile: Profile) => void;
}

export default function ProfileRow({ profile, isActive, onEdit }: ProfileRowProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const installedNames = useInstalledVersionNames();
  const versionInstalled = installedNames.includes(profile.version);
  const setActiveProfileId = useSettingsStore((s) => s.setActiveProfileId);
  const activeProfileId = useSettingsStore((s) => s.activeProfileId);
  const { loadProfiles } = useProfilesStore();

  const [logsOpen, setLogsOpen] = useState(false);
  const [cloneOpen, setCloneOpen] = useState(false);
  const [cloneName, setCloneName] = useState(`${profile.name} copy`);
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
        filters: [{ name: "Profile export", extensions: ["json"] }],
      });
      if (!path) return;
      await invoke("export_profile_file", { id: profile.id, path });
      toast.success("Profile exported");
    } catch (error) {
      toast.error("Export failed", { description: String(error) });
    }
  }

  async function copyShareCode() {
    try {
      const code = await invoke<string>("export_profile_code", { id: profile.id });
      await writeText(code);
      toast.success("Share code copied to clipboard");
    } catch (error) {
      toast.error("Failed to build share code", { description: String(error) });
    }
  }

  async function doClone() {
    const name = cloneName.trim();
    if (name.length < 2) return;
    setCloneBusy(true);
    try {
      await invoke("clone_profile", { id: profile.id, name });
      await loadProfiles();
      toast.success(`Cloned to "${name}"`);
      setCloneOpen(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error("Clone failed", { description: message });
    } finally {
      setCloneBusy(false);
    }
  }

  async function doDelete() {
    if (isActive || activeProfileId === profile.id) {
      toast.error("Switch to another profile before deleting this one");
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
        toast.success(`Removed "${profile.name}" from Story Forge`, {
          description: "The game data folder itself was left untouched.",
        });
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
        title: `Deleted "${profile.name}"`,
        description: "The folder was moved to the trash — you can undo this.",
        timeout: 10000,
        actionProps: {
          children: "Undo",
          onClick: () => {
            void invoke("restore_deleted_profile", { archiveName: result.archive_name }).then(
              async () => {
                await loadProfiles();
                void queryClient.invalidateQueries({ queryKey: ["deleted-profiles"] });
                void notify(`profile-restored-${result.archive_name}`, {
                  type: "success",
                  title: `Restored "${profile.name}"`,
                  timeout: 4000,
                });
              },
            );
          },
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error("Delete failed", { description: message });
    } finally {
      setDeleteBusy(false);
    }
  }

  const meta: string[] = [`v${profile.version}`, profile.sizeDisplay];
  meta.push(
    profile.lastTimePlayed > 0
      ? `Played ${formatDistanceToNow(new Date(profile.lastTimePlayed), { addSuffix: true })}`
      : "Never played",
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
              Active
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
              Existing data
            </Badge>
          )}
        </div>
        <div className="text-muted-foreground mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px]">
          {meta.map((item) => (
            <span key={item}>{item}</span>
          ))}
          {!versionInstalled && <span className="text-[var(--color-warning)]">Not installed</span>}
        </div>
      </div>

      {!isActive && (
        <Button size="sm" variant="outline" onClick={switchToThis}>
          Switch
        </Button>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button aria-label={`Actions for ${profile.name}`} size="icon-sm" variant="ghost" />
          }
        >
          <Ellipsis />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => onEdit(profile)} className="text-nowrap">
            <Pencil /> Edit
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => openMods("mods")} className="text-nowrap">
            <Package /> Manage Mods
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => openMods("config")} className="text-nowrap">
            <FileText /> Configure Mods
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => {
              void invoke("reveal_in_file_explorer", { path: profile.path }).catch((error) =>
                toast.error("Could not open folder", { description: String(error) }),
              );
            }}
          >
            <FolderOpen /> Open Folder
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setLogsOpen(true)} className="text-nowrap">
            <ScrollText /> View Logs
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => void exportFile()} className="text-nowrap">
            <Share2 /> Export as file…
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => void copyShareCode()} className="text-nowrap">
            <Link2 /> Copy share code
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => {
              setCloneName(`${profile.name} copy`);
              setCloneOpen(true);
            }}
            className="text-nowrap"
          >
            <Copy /> Clone…
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={isActive}
            title={isActive ? "Switch to another profile first" : undefined}
            variant="destructive"
            onClick={() => setDeleteOpen(true)}
            className="text-nowrap"
          >
            <Trash2 />{" "}
            {isActive
              ? "Delete (current profile)"
              : profile.external
                ? "Remove from Story Forge"
                : "Delete"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ProfileLogsSheet open={logsOpen} onOpenChange={setLogsOpen} profile={profile} />

      <Sheet open={cloneOpen} onOpenChange={(next) => !cloneBusy && setCloneOpen(next)}>
        <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-sm">
          <SheetHeader className="border-b">
            <SheetTitle>Clone “{profile.name}”</SheetTitle>
            <SheetDescription>
              Copies the whole profile folder — mods, configs and worlds included.
            </SheetDescription>
          </SheetHeader>
          <div className="grid gap-1.5 p-4">
            <label className="text-xs font-medium" htmlFor="clone-name">
              New name
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
              {cloneBusy ? "Cloning…" : "Clone profile"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <Sheet open={deleteOpen} onOpenChange={(next) => !deleteBusy && setDeleteOpen(next)}>
        <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-sm">
          <SheetHeader className="border-b">
            <SheetTitle>
              {profile.external
                ? `Remove “${profile.name}” from Story Forge?`
                : `Delete “${profile.name}”?`}
            </SheetTitle>
            <SheetDescription>
              {profile.external
                ? "This profile links to your existing Vintage Story data folder. Removing it only stops Story Forge from managing the folder — nothing inside it is moved or deleted."
                : "The profile folder is moved to the trash inside your profiles directory. You can undo this from the toast or the “Deleted profiles” section."}
            </SheetDescription>
          </SheetHeader>
          <SheetFooter className="border-t">
            <Button variant="destructive" disabled={deleteBusy} onClick={() => void doDelete()}>
              {deleteBusy
                ? profile.external
                  ? "Removing…"
                  : "Deleting…"
                : profile.external
                  ? "Remove from Story Forge"
                  : "Move to trash"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
