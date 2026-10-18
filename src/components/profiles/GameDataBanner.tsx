import { useQuery, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { Gamepad2, X } from "lucide-react";
import { useState } from "react";
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
import { defaultGameDataQueryKey, useDefaultGameData } from "@/hooks/use-default-game-data";
import { useInstalledVersionNames } from "@/hooks/use-installed-versions";
import { errorMessage } from "@/lib/errors";
import { compareSemverDesc } from "@/lib/helpers";
import { toast } from "@/lib/notify";
import { pickDefaultVersion } from "@/lib/pre-release";
import { gameVersionsQuery } from "@/lib/queries";
import type { DetectedGameData } from "@/lib/types";
import { useProfilesStore } from "@/stores/profiles";
import { useSettingsStore } from "@/stores/settings";

/** Banner offering the data folders the game itself would use. */
function GameDataFoundBanner({
  onDismiss,
  onUse,
  pending,
}: {
  onDismiss: () => void;
  onUse: () => void;
  pending: DetectedGameData[];
}) {
  const { t } = useTranslation();
  if (pending.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-3 border border-[var(--color-info)]/30 bg-[var(--color-info)]/5 p-3">
      <Gamepad2 className="size-4 shrink-0 text-[var(--color-info)]" />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium">{t("profiles.gameData.foundTitle")}</p>
        <p className="text-muted-foreground truncate text-[11px]">
          {pending.length > 1
            ? t("profiles.gameData.foundDescriptionMore", {
                path: pending[0].path,
                more: pending.length - 1,
              })
            : t("profiles.gameData.foundDescription", { path: pending[0].path })}
        </p>
      </div>
      <Button size="sm" variant="accent-primary" onClick={onUse}>
        {t("profiles.gameData.use")}
      </Button>
      <Button
        aria-label={t("common.actions.dismiss")}
        size="icon-sm"
        variant="ghost"
        onClick={onDismiss}
      >
        <X />
      </Button>
    </div>
  );
}

/** Folder picker shown when more than one unregistered data folder was found. */
function GameDataFolderSelect({
  items,
  onValueChange,
  value,
}: {
  items: DetectedGameData[];
  onValueChange: (value: string) => void;
  value: string;
}) {
  const { t } = useTranslation();
  if (items.length <= 1) return null;
  return (
    <div className="grid gap-1.5">
      <span className="text-xs font-medium">{t("common.fields.folder")}</span>
      <Select
        items={items.map((item) => ({ label: item.path, value: item.path }))}
        value={value}
        onValueChange={(next) => next && onValueChange(next)}
      >
        <SelectTrigger className="w-full" aria-label={t("profiles.gameData.folderAria")}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {items.map((item) => (
            <SelectItem key={item.path} value={item.path}>
              {item.path}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/** Size/mod/world summary of the folder picked in the sheet. */
function GameDataSelectedSummary({ selected }: { selected: DetectedGameData | undefined }) {
  const { t } = useTranslation();
  if (!selected) return null;
  return (
    <p className="bg-muted text-muted-foreground border p-2 text-[11px]">
      <span className="text-foreground font-medium">{selected.size_display}</span> ·{" "}
      {t("profiles.modCount", { count: selected.mod_count })} ·{" "}
      {selected.has_saves ? t("profiles.hasWorlds") : t("profiles.noWorlds")}
    </p>
  );
}

/** Game version picker for the adopted data folder. */
function GameDataVersionSelect({
  installedSet,
  onValueChange,
  value,
  versions,
}: {
  installedSet: Set<string>;
  onValueChange: (value: string) => void;
  value: string;
  versions: string[];
}) {
  const { t } = useTranslation();
  return (
    <div className="grid gap-1.5">
      <span className="text-xs font-medium">{t("profiles.fields.gameVersion")}</span>
      <Select
        items={versions.map((entry) => ({
          label: installedSet.has(entry)
            ? t("profiles.fields.installedVersion", { version: entry })
            : entry,
          value: entry,
        }))}
        value={value}
        onValueChange={(next) => next && onValueChange(next)}
      >
        <SelectTrigger className="w-full" aria-label={t("profiles.fields.gameVersion")}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {versions.map((entry) => (
            <SelectItem key={entry} value={entry}>
              {entry}
              {installedSet.has(entry) && (
                <span className="text-muted-foreground ml-2 text-xs">
                  {t("profiles.fields.installed")}
                </span>
              )}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-muted-foreground text-[11px]">{t("profiles.gameData.versionHint")}</p>
    </div>
  );
}

/** Submit button of the adopt sheet; disabled until the form is valid. */
function GameDataSubmitButton({
  busy,
  name,
  onAdopt,
  selectedPath,
  version,
}: {
  busy: boolean;
  name: string;
  onAdopt: () => void;
  selectedPath: string;
  version: string;
}) {
  const { t } = useTranslation();
  return (
    <Button
      variant="accent-primary"
      disabled={busy || !selectedPath || !version || name.trim().length < 2}
      onClick={onAdopt}
    >
      {busy
        ? t("profiles.gameData.linking")
        : t("profiles.gameData.useAs", {
            name: name.trim() || t("profiles.gameData.defaultName"),
          })}
    </Button>
  );
}

/**
 * Banner that offers to use an existing Vintage Story installation's data
 * folder (the game's default `VintagestoryData` location) as a profile.
 * Nothing is copied or moved — the profile links to the folder.
 */
export default function GameDataBanner() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data: detected } = useDefaultGameData();
  const dismissed = useSettingsStore((s) => s.gameDataDismissed);
  const dismiss = useSettingsStore((s) => s.dismissGameData);
  const setActiveProfileId = useSettingsStore((s) => s.setActiveProfileId);
  const showPreRelease = useSettingsStore((s) => s.showPreRelease);
  const { loadProfiles } = useProfilesStore();
  const { data: gameVersions } = useQuery(gameVersionsQuery);
  const installedNames = useInstalledVersionNames();
  const installedSet = new Set(installedNames);

  const [open, setOpen] = useState(false);
  const [selectedPath, setSelectedPath] = useState("");
  const [name, setName] = useState("Vintage Story");
  const [version, setVersion] = useState("");
  const [busy, setBusy] = useState(false);

  const pending = (detected ?? []).filter((item) => !item.registered);
  const selected = (detected ?? []).find((item) => item.path === selectedPath);
  const versions = (gameVersions ?? []).toSorted(compareSemverDesc);

  function openSheet() {
    const first = pending[0];
    setSelectedPath(first?.path ?? "");
    setName("Vintage Story");
    setVersion(pickDefaultVersion(versions, showPreRelease));
    setOpen(true);
  }

  async function adopt() {
    if (!selectedPath || !version || name.trim().length < 2) return;
    setBusy(true);
    try {
      const result = await invoke<{ id: number; name: string }>("adopt_game_data", {
        path: selectedPath,
        name: name.trim(),
        version,
      });
      await loadProfiles();
      setActiveProfileId(result.id);
      await queryClient.invalidateQueries({ queryKey: defaultGameDataQueryKey });
      setOpen(false);
    } catch (error) {
      const message = errorMessage(error);
      toast.error(t("profiles.gameData.adoptFailed"), { description: message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {!dismissed && (
        <GameDataFoundBanner pending={pending} onDismiss={dismiss} onUse={openSheet} />
      )}

      <Sheet open={open} onOpenChange={(next) => !busy && setOpen(next)}>
        <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-md">
          <SheetHeader className="border-b">
            <SheetTitle>{t("profiles.gameData.title")}</SheetTitle>
            <SheetDescription>{t("profiles.gameData.description")}</SheetDescription>
          </SheetHeader>

          <ScrollArea scrollFade className="min-h-0 flex-1">
            <div className="grid gap-4 p-4">
              <GameDataFolderSelect
                items={pending}
                value={selectedPath}
                onValueChange={setSelectedPath}
              />

              <GameDataSelectedSummary selected={selected} />

              <div className="grid gap-1.5">
                <label className="text-xs font-medium" htmlFor="game-data-name">
                  {t("profiles.fields.profileName")}
                </label>
                <Input
                  id="game-data-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </div>

              <GameDataVersionSelect
                installedSet={installedSet}
                value={version}
                versions={versions}
                onValueChange={setVersion}
              />
            </div>
          </ScrollArea>

          <SheetFooter className="border-t">
            <GameDataSubmitButton
              busy={busy}
              name={name}
              selectedPath={selectedPath}
              version={version}
              onAdopt={() => void adopt()}
            />
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
}
