import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { useInstalledVersionNames } from "@/hooks/use-installed-versions";
import { buildProfilePath, compareSemverDesc, makeStringFolderSafe } from "@/lib/helpers";
import { toast } from "@/lib/notify";
import { gameVersionsQuery } from "@/lib/queries";
import { useProfilesStore, type Profile } from "@/stores/profiles";
import { useSettingsStore } from "@/stores/settings";

import { EnvVarsEditor, envEntriesToMap, mapToEnvEntries, type EnvVarEntry } from "./EnvVarsEditor";
import { ProfileIconPicker } from "./ProfileIconPicker";

interface ProfileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Existing profile to edit; omit to create a new one. */
  profile?: Profile | null;
}

export default function ProfileDialog({ open, onOpenChange, profile }: ProfileDialogProps) {
  const isEdit = profile != null;
  const { data: gameVersions } = useQuery(gameVersionsQuery);
  const installedNames = useInstalledVersionNames();
  const installedSet = new Set(installedNames);
  const { appFolder } = useAppFolder();
  const { profilesParent, profilesSubdir } = useSettingsStore();
  const { loadProfiles, addProfile } = useProfilesStore();
  const setActiveProfileId = useSettingsStore((s) => s.setActiveProfileId);

  const defaultVersion =
    gameVersions?.toSorted(compareSemverDesc).filter((v) => !v.includes("rc"))[0] ?? "";

  const [name, setName] = useState(profile?.name ?? "");
  const [version, setVersion] = useState(profile?.version || defaultVersion);
  const [startParams, setStartParams] = useState(profile?.startParams ?? "");
  const [icon, setIcon] = useState<string | null>(profile?.icon ?? null);
  const [favorite, setFavorite] = useState(profile?.favorite ?? false);
  const [envEntries, setEnvEntries] = useState<EnvVarEntry[]>(
    mapToEnvEntries(profile?.environmentVariables),
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const trimmedName = name.trim();
    if (trimmedName.length < 2) {
      setError("Name must be at least 2 characters");
      return;
    }
    if (!version) {
      setError("Pick a game version");
      return;
    }
    if (!isEdit && !appFolder) {
      setError("Could not resolve the app data folder");
      return;
    }
    setError(null);

    try {
      const envVars = envEntriesToMap(envEntries);
      let path = isEdit
        ? profile.path
        : buildProfilePath(
            profilesParent ?? appFolder ?? "",
            makeStringFolderSafe(trimmedName),
            profilesSubdir,
          );

      setBusy(isEdit ? "Saving…" : "Creating profile…");
      if (!isEdit) {
        await invoke("initialize_game", { path });
      } else {
        // Renaming changes the folder name (and therefore the profile id), so
        // use the rename command before saving the remaining fields. Adopted
        // game data folders keep their (user-owned) folder name.
        const currentFolder = profile.path.split(/[/\\]/).filter(Boolean).pop();
        const desiredFolder = makeStringFolderSafe(trimmedName);
        if (!profile.external && currentFolder && desiredFolder !== currentFolder) {
          const renamed = await invoke<{ path: string }>("rename_profile", {
            id: profile.id,
            name: trimmedName,
          });
          path = renamed.path;
        }
      }
      await invoke("save_profile", {
        path,
        name: trimmedName,
        version,
        startParams,
        favorite,
        icon,
        envVars,
      });

      await loadProfiles();
      const saved = useProfilesStore.getState().profiles.find((p) => p.path === path);
      if (saved) setActiveProfileId(saved.id);
      else if (!isEdit) {
        // The scan may not have picked it up yet (first profile on a custom
        // root): insert a minimal record so the UI has something to show.
        addProfile({
          id: Date.now(),
          name: trimmedName,
          index: Date.now(),
          path,
          lastTimePlayed: 0,
          totalTimePlayed: 0,
          version,
          startParams,
          icon,
          favorite,
          sizeBytes: 0,
          sizeDisplay: "…",
          modpackSlug: null,
          modpackVersion: null,
          environmentVariables: envVars,
          external: false,
        });
      }

      toast.success(isEdit ? `Saved "${trimmedName}"` : `Created "${trimmedName}"`);
      onOpenChange(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      toast.error(isEdit ? "Failed to save profile" : "Failed to create profile", {
        description: message,
      });
    } finally {
      setBusy(null);
    }
  }

  return (
    <Sheet open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b">
          <SheetTitle>{isEdit ? `Edit "${profile.name}"` : "New profile"}</SheetTitle>
          <SheetDescription>
            A profile is an isolated Vintage Story data folder with its own mods, worlds and
            settings.
          </SheetDescription>
        </SheetHeader>

        <ScrollArea scrollFade className="min-h-0 flex-1">
          <div className="grid gap-4 p-4">
            <div className="grid gap-1.5">
              <label className="text-xs font-medium" htmlFor="profile-name">
                Name
              </label>
              <Input
                id="profile-name"
                placeholder="My profile"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </div>

            <div className="grid gap-1.5">
              <span className="text-xs font-medium">Game version</span>
              <Select
                items={(gameVersions ?? []).toSorted(compareSemverDesc).map((v) => ({
                  label: installedSet.has(v) ? `${v} (installed)` : v,
                  value: v,
                }))}
                value={version}
                onValueChange={(value) => value && setVersion(value)}
              >
                <SelectTrigger className="w-full" aria-label="Game version">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(gameVersions ?? []).toSorted(compareSemverDesc).map((v) => (
                    <SelectItem key={v} value={v}>
                      {v}
                      {installedSet.has(v) && (
                        <span className="text-muted-foreground ml-2 text-xs">(installed)</span>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {version && !installedSet.has(version) && (
                <p className="text-muted-foreground text-[11px]">
                  Version {version} is not installed yet — the sidebar offers a download button for
                  it when you are ready.
                </p>
              )}
            </div>

            <div className="grid gap-1.5">
              <span className="text-xs font-medium">Icon</span>
              <ProfileIconPicker value={icon} onChange={setIcon} />
            </div>

            <div className="flex items-center justify-between gap-4">
              <div className="grid gap-0.5">
                <span className="text-xs font-medium">Favorite</span>
                <span className="text-muted-foreground text-[11px]">
                  Favorites sort first in lists.
                </span>
              </div>
              <Switch checked={favorite} onCheckedChange={setFavorite} />
            </div>

            <div className="grid gap-1.5">
              <label className="text-xs font-medium" htmlFor="profile-start-params">
                Launch parameters <span className="text-muted-foreground">(optional)</span>
              </label>
              <Input
                id="profile-start-params"
                className="font-mono"
                placeholder="--some-flag value"
                value={startParams}
                onChange={(event) => setStartParams(event.target.value)}
              />
            </div>

            <div className="grid gap-1.5">
              <span className="text-xs font-medium">Environment variables</span>
              <EnvVarsEditor entries={envEntries} onChange={setEnvEntries} />
            </div>

            {isEdit && (
              <div className="grid gap-1.5">
                <span className="text-xs font-medium">Folder</span>
                <p className="bg-muted text-muted-foreground border p-2 font-mono text-[11px] break-all">
                  {profile.path}
                </p>
              </div>
            )}

            {error && <p className="text-destructive text-xs">{error}</p>}
          </div>
        </ScrollArea>

        <SheetFooter className="border-t">
          <Button variant="accent-primary" disabled={busy !== null} onClick={() => void submit()}>
            {busy ?? (isEdit ? "Save changes" : "Create profile")}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
