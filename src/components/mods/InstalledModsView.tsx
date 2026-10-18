import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import type { TFunction } from "i18next";
import { GripVertical } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { Skeleton } from "@/components/ui/skeleton";
import { installedModsQueryKey, useInstalledMods } from "@/hooks/use-installed-mods";
import { modUpdatesQueryKey } from "@/hooks/use-mod-updates";
import { useApplyModState, useSetModEnabled } from "@/hooks/use-set-mod-enabled";
import { errorMessage } from "@/lib/errors";
import { sectionMods, type ModGroup, type ModSection } from "@/lib/mod-groups";
import { toast } from "@/lib/notify";
import type { OutputMod } from "@/lib/types";
import { useSettingsStore } from "@/stores/settings";

import { InstalledModsList } from "./InstalledModsList";
import { InstalledModsSelectionBar } from "./InstalledModsSelectionBar";
import { InstalledModsToolbar } from "./InstalledModsToolbar";
import { ModPresetsSheet } from "./ModPresetsSheet";

/** Stable empty list so the selector doesn't churn identities. */
const NO_GROUPS: never[] = [];

/** Spoken during a drag; dnd-kit's defaults would announce the internal ids. */
function groupAnnouncements(t: TFunction, groups: ModGroup[]): Announcements {
  const groupName = (id: UniqueIdentifier) =>
    groups.find((group) => group.id === String(id))?.name ?? "";
  const groupPosition = (id: UniqueIdentifier) =>
    groups.findIndex((group) => group.id === String(id)) + 1;
  return {
    onDragStart: ({ active }) => t("mods.groups.a11yLifted", { name: groupName(active.id) }),
    onDragOver: ({ active, over }) =>
      over && over.id !== active.id
        ? t("mods.groups.a11yMoved", {
            name: groupName(active.id),
            position: groupPosition(over.id),
            total: groups.length,
          })
        : undefined,
    onDragEnd: ({ active, over }) =>
      over
        ? t("mods.groups.a11yDropped", {
            name: groupName(active.id),
            position: groupPosition(over.id),
            total: groups.length,
          })
        : undefined,
    onDragCancel: ({ active }) => t("mods.groups.a11yCancelled", { name: groupName(active.id) }),
  };
}

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
  const reorderModGroups = useSettingsStore((s) => s.reorderModGroups);
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
  const [presetsOpen, setPresetsOpen] = useState(false);
  const [draggingGroupId, setDraggingGroupId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const mods = useMemo(() => data?.mods ?? [], [data]);
  const sections = useMemo(() => sectionMods(groups, mods), [groups, mods]);
  const draggingGroup = groups.find((group) => group.id === draggingGroupId);
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
      toast.error(t("mods.installed.removeFailed"), { description: errorMessage(error) });
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

  const clearSelection = () => {
    setConfirmBatchRemove(false);
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

  const finishGroupDrag = ({ active, over }: DragEndEvent) => {
    setDraggingGroupId(null);
    if (!over) return;
    reorderModGroups(modsDirectory, String(active.id), String(over.id));
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
    <DndContext
      accessibility={{
        announcements: groupAnnouncements(t, groups),
        screenReaderInstructions: { draggable: t("mods.groups.a11yInstructions") },
      }}
      collisionDetection={closestCenter}
      modifiers={[restrictToVerticalAxis]}
      onDragCancel={() => setDraggingGroupId(null)}
      onDragEnd={finishGroupDrag}
      onDragStart={({ active }) => setDraggingGroupId(String(active.id))}
      sensors={sensors}
    >
      <div className="relative flex min-h-0 flex-1 flex-col gap-3">
        <InstalledModsToolbar
          applyPending={applyState.isPending}
          canToggleMods={canToggleMods}
          creatingGroup={creatingGroup}
          modCount={mods.length}
          newGroupName={newGroupName}
          onApplyAll={(enabled) => applyEnabled(mods, enabled)}
          onCancelCreate={() => setCreatingGroup(false)}
          onCreateGroup={saveNewGroup}
          onNewGroupNameChange={setNewGroupName}
          onOpenPresets={() => setPresetsOpen(true)}
          onStartCreate={() => setCreatingGroup(true)}
        />

        <InstalledModsList
          applyEnabled={applyEnabled}
          applyPending={applyState.isPending}
          canToggleMods={canToggleMods}
          collapsed={collapsed}
          confirmDeleteGroupId={confirmDeleteGroupId}
          deleteModGroup={deleteModGroup}
          groups={groups}
          mods={mods}
          modsDirectory={modsDirectory}
          moveModsToGroup={moveModsToGroup}
          onRemoveMod={(mod) => removeMods.mutate([mod.path])}
          renameName={renameName}
          renamingId={renamingId}
          saveRename={saveRename}
          sections={sections}
          selectMod={selectMod}
          selectSection={selectSection}
          selected={selected}
          setCollapsed={setCollapsed}
          setConfirmDeleteGroupId={setConfirmDeleteGroupId}
          setModEnabled={setModEnabled}
          setRenameName={setRenameName}
          setRenamingId={setRenamingId}
        />

        <InstalledModsSelectionBar
          applyEnabled={applyEnabled}
          applyPending={applyState.isPending}
          canToggleMods={canToggleMods}
          confirmBatchRemove={confirmBatchRemove}
          groups={groups}
          moveToGroup={moveSelection}
          onClearSelection={clearSelection}
          onRemoveSelected={removeSelected}
          selectedCount={selected.size}
          selectedMods={selectedMods}
          setConfirmBatchRemove={setConfirmBatchRemove}
        />

        <ModPresetsSheet
          modsDirectory={modsDirectory}
          open={presetsOpen}
          onOpenChange={setPresetsOpen}
        />

        <DragOverlay>
          {draggingGroup && (
            <div className="bg-popover text-popover-foreground flex items-center gap-2 border px-2.5 py-1.5 shadow-lg">
              <GripVertical className="text-muted-foreground size-4" />
              <span className="text-sm font-medium">{draggingGroup.name}</span>
            </div>
          )}
        </DragOverlay>
      </div>
    </DndContext>
  );
}
