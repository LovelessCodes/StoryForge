import { useQuery, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { Gamepad2, X } from "lucide-react";
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
import { defaultGameDataQueryKey, useDefaultGameData } from "@/hooks/use-default-game-data";
import { useInstalledVersionNames } from "@/hooks/use-installed-versions";
import { compareSemverDesc } from "@/lib/helpers";
import { toast } from "@/lib/notify";
import { gameVersionsQuery } from "@/lib/queries";
import { useProfilesStore } from "@/stores/profiles";
import { useSettingsStore } from "@/stores/settings";

/**
 * Banner that offers to use an existing Vintage Story installation's data
 * folder (the game's default `VintagestoryData` location) as a profile.
 * Nothing is copied or moved — the profile links to the folder.
 */
export default function GameDataBanner() {
  const queryClient = useQueryClient();
  const { data: detected } = useDefaultGameData();
  const dismissed = useSettingsStore((s) => s.gameDataDismissed);
  const dismiss = useSettingsStore((s) => s.dismissGameData);
  const setActiveProfileId = useSettingsStore((s) => s.setActiveProfileId);
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

  function openSheet() {
    const first = pending[0];
    const versions = (gameVersions ?? []).toSorted(compareSemverDesc);
    setSelectedPath(first?.path ?? "");
    setName("Vintage Story");
    setVersion(versions.find((entry) => !entry.includes("rc")) ?? versions[0] ?? "");
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
      const message = error instanceof Error ? error.message : String(error);
      toast.error("Could not use that folder", { description: message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {!dismissed && pending.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 border border-[var(--color-info)]/30 bg-[var(--color-info)]/5 p-3">
          <Gamepad2 className="size-4 shrink-0 text-[var(--color-info)]" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium">Existing Vintage Story data found</p>
            <p className="text-muted-foreground truncate text-[11px]">
              {pending[0].path}
              {pending.length > 1 ? ` (+${pending.length - 1} more)` : ""} — use it as a profile
              without copying anything.
            </p>
          </div>
          <Button size="sm" variant="accent-primary" onClick={openSheet}>
            Use it
          </Button>
          <Button aria-label="Dismiss" size="icon-sm" variant="ghost" onClick={dismiss}>
            <X />
          </Button>
        </div>
      )}

      <Sheet open={open} onOpenChange={(next) => !busy && setOpen(next)}>
        <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-md">
          <SheetHeader className="border-b">
            <SheetTitle>Use your existing game data</SheetTitle>
            <SheetDescription>
              Story Forge links to the folder instead of copying it — your mods, worlds and settings
              stay exactly where they are.
            </SheetDescription>
          </SheetHeader>

          <ScrollArea scrollFade className="min-h-0 flex-1">
            <div className="grid gap-4 p-4">
              {pending.length > 1 && (
                <div className="grid gap-1.5">
                  <span className="text-xs font-medium">Folder</span>
                  <Select
                    items={pending.map((item) => ({ label: item.path, value: item.path }))}
                    value={selectedPath}
                    onValueChange={(value) => value && setSelectedPath(value)}
                  >
                    <SelectTrigger className="w-full" aria-label="Game data folder">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {pending.map((item) => (
                        <SelectItem key={item.path} value={item.path}>
                          {item.path}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {selected && (
                <p className="bg-muted text-muted-foreground border p-2 text-[11px]">
                  <span className="text-foreground font-medium">{selected.size_display}</span> ·{" "}
                  {selected.mod_count} mod{selected.mod_count === 1 ? "" : "s"} ·{" "}
                  {selected.has_saves ? "has worlds" : "no worlds yet"}
                </p>
              )}

              <div className="grid gap-1.5">
                <label className="text-xs font-medium" htmlFor="game-data-name">
                  Profile name
                </label>
                <Input
                  id="game-data-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </div>

              <div className="grid gap-1.5">
                <span className="text-xs font-medium">Game version</span>
                <Select
                  items={(gameVersions ?? []).toSorted(compareSemverDesc).map((entry) => ({
                    label: installedSet.has(entry) ? `${entry} (installed)` : entry,
                    value: entry,
                  }))}
                  value={version}
                  onValueChange={(value) => value && setVersion(value)}
                >
                  <SelectTrigger className="w-full" aria-label="Game version">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(gameVersions ?? []).toSorted(compareSemverDesc).map((entry) => (
                      <SelectItem key={entry} value={entry}>
                        {entry}
                        {installedSet.has(entry) && (
                          <span className="text-muted-foreground ml-2 text-xs">(installed)</span>
                        )}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-muted-foreground text-[11px]">
                  Your data folder does not record its game version — pick the one you play. It will
                  be downloaded on first launch if it is not installed yet.
                </p>
              </div>
            </div>
          </ScrollArea>

          <SheetFooter className="border-t">
            <Button
              variant="accent-primary"
              disabled={busy || !selectedPath || !version || name.trim().length < 2}
              onClick={() => void adopt()}
            >
              {busy ? "Linking…" : `Use as "${name.trim() || "profile"}"`}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
}
