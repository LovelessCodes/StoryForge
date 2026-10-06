import { useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import {
  ChevronDown,
  ChevronRight,
  Ellipsis,
  FolderInput,
  FolderPlus,
  Pencil,
  Power,
  PowerOff,
  Trash2,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { installedModsQueryKey, useInstalledMods } from "@/hooks/use-installed-mods";
import { modUpdatesQueryKey } from "@/hooks/use-mod-updates";
import { useApplyModState, useSetModEnabled } from "@/hooks/use-set-mod-enabled";
import { sectionMods, type ModSection } from "@/lib/mod-groups";
import { toast } from "@/lib/notify";
import type { OutputMod } from "@/lib/types";
import { useSettingsStore } from "@/stores/settings";

import { InstalledModRow } from "./InstalledModRow";

/** Stable empty list so the selector doesn't churn identities. */
const NO_GROUPS: never[] = [];

/**
 * The installed mods of one target, organized into user-defined groups.
 *
 * Groups are purely organizational — the game loads the same mods either way.
 * Rows can be selected for batch enable/disable, group moves and removal, and
 * every group header carries the same actions for its members.
 */
export function InstalledModsView({
  canToggleMods,
  modsDirectory,
}: {
  canToggleMods: boolean;
  modsDirectory: string;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data, isPending } = useInstalledMods(modsDirectory);
  const groups = useSettingsStore((s) => s.modGroups[modsDirectory] ?? NO_GROUPS);
  const createModGroup = useSettingsStore((s) => s.createModGroup);
  const renameModGroup = useSettingsStore((s) => s.renameModGroup);
  const deleteModGroup = useSettingsStore((s) => s.deleteModGroup);
  const moveModsToGroup = useSettingsStore((s) => s.moveModsToGroup);
  const applyState = useApplyModState(modsDirectory);
  const { mutate: setModEnabled } = useSetModEnabled(modsDirectory);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameName, setRenameName] = useState("");
  const [confirmDeleteGroupId, setConfirmDeleteGroupId] = useState<string | null>(null);
  const [confirmBatchRemove, setConfirmBatchRemove] = useState(false);

  const mods = useMemo(() => data?.mods ?? [], [data]);
  const sections = useMemo(() => sectionMods(groups, mods), [groups, mods]);
  const selectedMods = useMemo(
    () => mods.filter((mod) => selected.has(mod.modid.toLowerCase())),
    [mods, selected],
  );

  const removeMods = useMutation({
    mutationFn: async (paths: string[]) => {
      const results = await Promise.allSettled(
        paths.map((modpath) =>
          invoke("remove_mod_from_profile", { params: { modpath, path: modsDirectory } }),
        ),
      );
      const failed = results.filter((result) => result.status === "rejected").length;
      return { failed, removed: paths.length - failed };
    },
    onSuccess: ({ failed, removed }) => {
      void queryClient.invalidateQueries({ queryKey: installedModsQueryKey(modsDirectory) });
      void queryClient.invalidateQueries({ queryKey: modUpdatesQueryKey(modsDirectory) });
      if (failed > 0) toast.warning(t("mods.installed.removePartial", { failed }));
      if (removed > 0) toast.success(t("mods.installed.removed", { count: removed }));
    },
    onError: (error) => {
      toast.error(t("mods.installed.removeFailed"), { description: String(error) });
    },
  });

  const selectMod = (modid: string, isSelected: boolean) => {
    setSelected((previous) => {
      const next = new Set(previous);
      if (isSelected) next.add(modid.toLowerCase());
      else next.delete(modid.toLowerCase());
      return next;
    });
  };

  const sectionState = (section: ModSection) => {
    const total = section.mods.length;
    const enabled = section.mods.filter((mod) => !mod.disabled).length;
    const selectedHere = section.mods.filter((mod) => selected.has(mod.modid.toLowerCase())).length;
    return { total, enabled, selectedHere };
  };

  const selectSection = (section: ModSection, isSelected: boolean) => {
    setSelected((previous) => {
      const next = new Set(previous);
      for (const mod of section.mods) {
        const id = mod.modid.toLowerCase();
        if (isSelected) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  };

  /** Applies enable/disable to a set of mods in one write, via the full state. */
  const applyEnabled = (targets: OutputMod[], enabled: boolean) => {
    const targetIds = new Set(targets.map((mod) => mod.modid.toLowerCase()));
    const byModid = new Map<string, boolean>();
    for (const mod of mods) {
      const id = mod.modid.toLowerCase();
      const disabled = targetIds.has(id) ? !enabled : (mod.disabled ?? false);
      byModid.set(id, (byModid.get(id) ?? false) || disabled);
    }
    const disabledList = [...byModid.entries()]
      .filter(([, disabled]) => disabled)
      .map(([id]) => id);
    applyState.mutate(disabledList, {
      onSuccess: () => {
        toast.success(t("mods.installed.stateChanged", { count: targets.length }));
        setSelected(new Set());
      },
    });
  };

  const removeSelected = () => {
    setConfirmBatchRemove(false);
    removeMods.mutate(selectedMods.map((mod) => mod.path));
    setSelected(new Set());
  };

  const moveSelection = (groupId: string | null) => {
    moveModsToGroup(
      modsDirectory,
      selectedMods.map((mod) => mod.modid),
      groupId,
    );
    toast.success(t("mods.installed.moved", { count: selectedMods.length }));
    setSelected(new Set());
  };

  const saveNewGroup = () => {
    const name = newGroupName.trim();
    if (!name) return;
    createModGroup(modsDirectory, name);
    toast.success(t("mods.groups.created", { name }));
    setNewGroupName("");
    setCreatingGroup(false);
  };

  const saveRename = (groupId: string) => {
    const name = renameName.trim();
    if (!name) return;
    renameModGroup(modsDirectory, groupId, name);
    setRenamingId(null);
  };

  if (isPending && mods.length === 0) {
    return (
      <div className="grid gap-2">
        {[0, 1, 2].map((index) => (
          <Skeleton className="h-12 w-full" key={index} />
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-muted-foreground text-xs">
          {t("mods.installed.count", { count: mods.length })}
        </span>
        {creatingGroup ? (
          <div className="flex items-center gap-2">
            <Input
              aria-label={t("mods.groups.namePlaceholder")}
              className="h-8 max-w-48"
              placeholder={t("mods.groups.namePlaceholder")}
              value={newGroupName}
              onChange={(event) => setNewGroupName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") saveNewGroup();
                if (event.key === "Escape") setCreatingGroup(false);
              }}
            />
            <Button disabled={newGroupName.trim().length === 0} onClick={saveNewGroup} size="sm">
              {t("mods.groups.create")}
            </Button>
            <Button onClick={() => setCreatingGroup(false)} size="sm" variant="ghost">
              {t("common.actions.cancel")}
            </Button>
          </div>
        ) : (
          <Button onClick={() => setCreatingGroup(true)} size="sm" variant="outline">
            <FolderPlus />
            {t("mods.groups.new")}
          </Button>
        )}
      </div>

      {selected.size > 0 && (
        <div className="bg-muted/40 flex flex-wrap items-center gap-2 border p-2">
          <span className="text-xs font-medium">
            {t("mods.installed.selected", { count: selected.size })}
          </span>
          {canToggleMods && (
            <>
              <Button
                disabled={applyState.isPending}
                onClick={() => applyEnabled(selectedMods, true)}
                size="sm"
                variant="outline"
              >
                <Power />
                {t("mods.installed.enable")}
              </Button>
              <Button
                disabled={applyState.isPending}
                onClick={() => applyEnabled(selectedMods, false)}
                size="sm"
                variant="outline"
              >
                <PowerOff />
                {t("mods.installed.disable")}
              </Button>
            </>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button size="sm" variant="outline" />}>
              <FolderInput />
              {t("mods.installed.moveToGroup")}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuLabel>{t("mods.installed.moveToGroup")}</DropdownMenuLabel>
              <DropdownMenuItem className="text-nowrap" onClick={() => moveSelection(null)}>
                {t("mods.installed.ungrouped")}
              </DropdownMenuItem>
              {groups.length > 0 && <DropdownMenuSeparator />}
              {groups.map((group) => (
                <DropdownMenuItem
                  className="text-nowrap"
                  key={group.id}
                  onClick={() => moveSelection(group.id)}
                >
                  {group.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          {confirmBatchRemove ? (
            <>
              <span className="text-destructive text-[11px]">
                {t("mods.installed.removeConfirm", { count: selectedMods.length })}
              </span>
              <Button onClick={() => setConfirmBatchRemove(false)} size="sm" variant="ghost">
                {t("common.actions.cancel")}
              </Button>
              <Button onClick={removeSelected} size="sm" variant="destructive">
                <Trash2 />
                {t("mods.installed.remove")}
              </Button>
            </>
          ) : (
            <Button onClick={() => setConfirmBatchRemove(true)} size="sm" variant="destructive">
              <Trash2 />
              {t("mods.installed.remove")}
            </Button>
          )}
          <Button
            aria-label={t("mods.installed.clearSelection")}
            onClick={() => setSelected(new Set())}
            size="icon-sm"
            title={t("mods.installed.clearSelection")}
            variant="ghost"
          >
            <X />
          </Button>
        </div>
      )}

      {mods.length === 0 ? (
        <p className="text-muted-foreground border border-dashed p-6 text-center text-xs">
          {t("mods.installed.empty")}
        </p>
      ) : (
        sections.map((section) => {
          const key = section.group?.id ?? "__ungrouped__";
          const isCollapsed = collapsed.has(key);
          const { total, enabled, selectedHere } = sectionState(section);
          return (
            <section className="grid gap-1.5" key={key}>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  aria-label={isCollapsed ? t("mods.groups.expand") : t("mods.groups.collapse")}
                  onClick={() =>
                    setCollapsed((previous) => {
                      const next = new Set(previous);
                      if (next.has(key)) next.delete(key);
                      else next.add(key);
                      return next;
                    })
                  }
                  size="icon-sm"
                  variant="ghost"
                >
                  {isCollapsed ? <ChevronRight /> : <ChevronDown />}
                </Button>
                <Checkbox
                  aria-label={t("mods.installed.selectAll")}
                  checked={total > 0 && selectedHere === total}
                  disabled={total === 0}
                  indeterminate={selectedHere > 0 && selectedHere < total}
                  onCheckedChange={(checked) => selectSection(section, checked === true)}
                />
                {section.group && renamingId === section.group.id ? (
                  <>
                    <Input
                      className="h-7 max-w-48"
                      value={renameName}
                      onChange={(event) => setRenameName(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && section.group) saveRename(section.group.id);
                        if (event.key === "Escape") setRenamingId(null);
                      }}
                    />
                    <Button
                      onClick={() => section.group && saveRename(section.group.id)}
                      size="sm"
                      variant="outline"
                    >
                      {t("mods.groups.save")}
                    </Button>
                    <Button onClick={() => setRenamingId(null)} size="sm" variant="ghost">
                      {t("common.actions.cancel")}
                    </Button>
                  </>
                ) : (
                  <h3 className="text-sm font-medium">
                    {section.group ? section.group.name : t("mods.installed.ungrouped")}
                  </h3>
                )}
                <span className="text-muted-foreground text-[11px]">
                  {t("mods.installed.enabledCount", { enabled, total })}
                </span>
                <div className="ms-auto flex items-center gap-1">
                  {canToggleMods && (
                    <>
                      <Button
                        aria-label={t("mods.groups.enableAll")}
                        disabled={applyState.isPending || total === 0}
                        onClick={() => applyEnabled(section.mods, true)}
                        size="icon-sm"
                        title={t("mods.groups.enableAll")}
                        variant="ghost"
                      >
                        <Power />
                      </Button>
                      <Button
                        aria-label={t("mods.groups.disableAll")}
                        disabled={applyState.isPending || total === 0}
                        onClick={() => applyEnabled(section.mods, false)}
                        size="icon-sm"
                        title={t("mods.groups.disableAll")}
                        variant="ghost"
                      >
                        <PowerOff />
                      </Button>
                    </>
                  )}
                  {section.group && (
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button
                            aria-label={t("mods.groups.menu")}
                            size="icon-sm"
                            variant="ghost"
                          />
                        }
                      >
                        <Ellipsis />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          className="text-nowrap"
                          onClick={() => {
                            if (!section.group) return;
                            setRenamingId(section.group.id);
                            setRenameName(section.group.name);
                          }}
                        >
                          <Pencil /> {t("mods.groups.rename")}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive text-nowrap"
                          onClick={() => setConfirmDeleteGroupId(section.group?.id ?? null)}
                        >
                          <Trash2 /> {t("mods.groups.delete")}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
                {section.group && confirmDeleteGroupId === section.group.id && (
                  <div className="flex w-full items-center gap-2">
                    <span className="text-destructive text-[11px]">
                      {t("mods.groups.deleteConfirm")}
                    </span>
                    <Button onClick={() => setConfirmDeleteGroupId(null)} size="sm" variant="ghost">
                      {t("common.actions.cancel")}
                    </Button>
                    <Button
                      onClick={() => {
                        if (!section.group) return;
                        deleteModGroup(modsDirectory, section.group.id);
                        toast.success(t("mods.groups.deleted", { name: section.group.name }));
                        setConfirmDeleteGroupId(null);
                      }}
                      size="sm"
                      variant="destructive"
                    >
                      {t("mods.groups.delete")}
                    </Button>
                  </div>
                )}
              </div>
              {!isCollapsed &&
                (section.mods.length === 0 ? (
                  <p className="text-muted-foreground px-1 text-[11px]">
                    {t("mods.installed.emptyGroup")}
                  </p>
                ) : (
                  <div className="grid gap-1.5">
                    {section.mods.map((installed) => (
                      <InstalledModRow
                        canToggleMods={canToggleMods}
                        groups={groups}
                        installed={installed}
                        key={installed.path}
                        onMove={(modids, groupId) => {
                          moveModsToGroup(modsDirectory, modids, groupId);
                          toast.success(t("mods.installed.moved", { count: modids.length }));
                        }}
                        onRemove={(mod) => removeMods.mutate([mod.path])}
                        onSelectedChange={selectMod}
                        onToggleEnabled={(mod, enabledNow) =>
                          setModEnabled({
                            enabled: enabledNow,
                            modid: mod.modid,
                            name: mod.name,
                            version: mod.version,
                          })
                        }
                        selected={selected.has(installed.modid.toLowerCase())}
                      />
                    ))}
                  </div>
                ))}
            </section>
          );
        })
      )}
    </div>
  );
}
