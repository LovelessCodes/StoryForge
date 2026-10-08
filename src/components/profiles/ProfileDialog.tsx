import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

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
import { useInstalledVersions } from "@/hooks/use-installed-versions";
import { errorMessage } from "@/lib/errors";
import {
  baseGameVersion,
  buildProfilePath,
  compareSemverDesc,
  isOptimumVersion,
  makeStringFolderSafe,
} from "@/lib/helpers";
import { toast } from "@/lib/notify";
import { gameVersionsQuery } from "@/lib/queries";
import { useProfilesStore, type Profile } from "@/stores/profiles";
import { useSettingsStore } from "@/stores/settings";

import { EnvVarsEditor, envEntriesToMap, mapToEnvEntries, type EnvVarEntry } from "./EnvVarsEditor";
import { ProfileIconPicker } from "./ProfileIconPicker";

interface ProfileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Fires after the close animation finishes (the parent clears its state). */
  onOpenChangeComplete?: (open: boolean) => void;
  /** Existing profile to edit; omit to create a new one. */
  profile?: Profile | null;
}

export default function ProfileDialog({
  open,
  onOpenChange,
  onOpenChangeComplete,
  profile,
}: ProfileDialogProps) {
  const { t } = useTranslation();
  const isEdit = profile != null;
  const { data: gameVersions } = useQuery(gameVersionsQuery);
  const { data: installedVersionRecords } = useInstalledVersions();
  const installedVersions = useMemo(() => installedVersionRecords ?? [], [installedVersionRecords]);
  const installedSet = useMemo(
    () => new Set(installedVersions.map((installed) => installed.name)),
    [installedVersions],
  );

  // The picker lists every published version plus any installed build the
  // catalog does not carry — most importantly Optimum builds, which are their
  // own version folders (`1.22.7+optimum`) but the same game version.
  const versionItems = useMemo(() => {
    const remote = (gameVersions ?? []).toSorted(compareSemverDesc);
    const extras = installedVersions.filter((installed) => !remote.includes(installed.name));
    const items = [
      ...remote.map((v) => ({
        label: installedSet.has(v) ? t("profiles.fields.installedVersion", { version: v }) : v,
        value: v,
      })),
      ...extras.map((installed) => ({
        label: isOptimumVersion(installed.name)
          ? t("profiles.fields.optimumVersion", {
              version: baseGameVersion(installed.name),
              optimum: installed.optimum_version ?? "",
            })
          : installed.name,
        value: installed.name,
      })),
    ];
    return items.toSorted((a, b) => {
      const byBase = compareSemverDesc(baseGameVersion(a.value), baseGameVersion(b.value));
      if (byBase !== 0) return byBase;
      return a.value.localeCompare(b.value);
    });
  }, [gameVersions, installedVersions, installedSet, t]);
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
  const [ignoreGameDefaults, setIgnoreGameDefaults] = useState(
    profile?.ignoreGameDefaults ?? false,
  );
  const [envEntries, setEnvEntries] = useState<EnvVarEntry[]>(
    mapToEnvEntries(profile?.environmentVariables),
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const trimmedName = name.trim();
    if (trimmedName.length < 2) {
      setError(t("profiles.dialog.nameTooShort"));
      return;
    }
    if (!version) {
      setError(t("profiles.dialog.pickVersion"));
      return;
    }
    if (!isEdit && !appFolder) {
      setError(t("profiles.dialog.noAppFolder"));
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

      setBusy(isEdit ? t("profiles.dialog.saving") : t("profiles.dialog.creating"));
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
      if (saved) {
        if (saved.ignoreGameDefaults !== ignoreGameDefaults) {
          await invoke("set_profile_game_defaults", {
            profileId: saved.id,
            ignoreGameDefaults,
          });
          await loadProfiles();
        }
        setActiveProfileId(saved.id);
      } else if (!isEdit) {
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
          backupOnPlay: false,
          backupLimit: 5,
          ignoreGameDefaults,
        });
      }

      onOpenChange(false);
    } catch (err) {
      const message = errorMessage(err);
      setError(message);
      toast.error(isEdit ? t("profiles.dialog.saveFailed") : t("profiles.dialog.createFailed"), {
        description: message,
      });
    } finally {
      setBusy(null);
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => !busy && onOpenChange(next)}
      onOpenChangeComplete={onOpenChangeComplete}
    >
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b">
          <SheetTitle>
            {isEdit
              ? t("profiles.dialog.editTitle", { name: profile.name })
              : t("profiles.dialog.newTitle")}
          </SheetTitle>
          <SheetDescription>{t("profiles.dialog.description")}</SheetDescription>
        </SheetHeader>

        <ScrollArea scrollFade className="min-h-0 flex-1">
          <div className="grid gap-4 p-4">
            <div className="grid gap-1.5">
              <label className="text-xs font-medium" htmlFor="profile-name">
                {t("common.fields.name")}
              </label>
              <Input
                id="profile-name"
                placeholder={t("profiles.dialog.namePlaceholder")}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </div>

            <div className="grid gap-1.5">
              <span className="text-xs font-medium">{t("profiles.fields.gameVersion")}</span>
              <Select
                items={versionItems}
                value={version}
                onValueChange={(value) => value && setVersion(value)}
              >
                <SelectTrigger className="w-full" aria-label={t("profiles.fields.gameVersion")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {versionItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                      {installedSet.has(item.value) && !isOptimumVersion(item.value) && (
                        <span className="text-muted-foreground ml-2 text-xs">
                          {t("profiles.fields.installed")}
                        </span>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {version && !installedSet.has(version) && (
                <p className="text-muted-foreground text-[11px]">
                  {t("profiles.dialog.versionNotInstalled", { version })}
                </p>
              )}
            </div>

            <div className="grid gap-1.5">
              <span className="text-xs font-medium">{t("profiles.dialog.icon")}</span>
              <ProfileIconPicker value={icon} onChange={setIcon} />
            </div>

            <div className="flex items-center justify-between gap-4">
              <div className="grid gap-0.5">
                <span className="text-xs font-medium">{t("profiles.dialog.favorite")}</span>
                <span className="text-muted-foreground text-[11px]">
                  {t("profiles.dialog.favoriteHint")}
                </span>
              </div>
              <Switch checked={favorite} onCheckedChange={setFavorite} />
            </div>

            <div className="flex items-center justify-between gap-4">
              <div className="grid gap-0.5">
                <span className="text-xs font-medium">
                  {t("profiles.dialog.ignoreGameDefaults")}
                </span>
                <span className="text-muted-foreground text-[11px]">
                  {t("profiles.dialog.ignoreGameDefaultsHint")}
                </span>
              </div>
              <Switch checked={ignoreGameDefaults} onCheckedChange={setIgnoreGameDefaults} />
            </div>

            <div className="grid gap-1.5">
              <label className="text-xs font-medium" htmlFor="profile-start-params">
                {t("profiles.dialog.launchParameters")}{" "}
                <span className="text-muted-foreground">({t("profiles.dialog.optional")})</span>
              </label>
              <Input
                id="profile-start-params"
                className="font-mono"
                placeholder={t("profiles.dialog.startParamsPlaceholder")}
                value={startParams}
                onChange={(event) => setStartParams(event.target.value)}
              />
            </div>

            <div className="grid gap-1.5">
              <span className="text-xs font-medium">
                {t("profiles.dialog.environmentVariables")}
              </span>
              <EnvVarsEditor entries={envEntries} onChange={setEnvEntries} />
            </div>

            {isEdit && (
              <div className="grid gap-1.5">
                <span className="text-xs font-medium">{t("common.fields.folder")}</span>
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
            {busy ?? (isEdit ? t("profiles.dialog.saveChanges") : t("profiles.dialog.create"))}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
