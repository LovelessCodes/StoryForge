import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type DraggableAttributes,
  type DraggableSyntheticListeners,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "cn";
import { GripVertical } from "lucide-react";
import { useMemo, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import type { ModGroup } from "@/lib/mod-groups";
import type { OutputMod } from "@/lib/types";

import { InstalledModRow } from "./InstalledModRow";

/** Grip props the sortable wrapper hands to a row. */
type RowHandle = {
  attributes: DraggableAttributes;
  listeners: DraggableSyntheticListeners;
  ref: (element: HTMLElement | null) => void;
};

/**
 * The rows of one installed section, as their own drag context. It is nested
 * inside the group drag context, so a row drag and a group drag never claim
 * the same gesture.
 */
export function InstalledModRows({
  canToggleMods,
  groups,
  mods,
  onMove,
  onRemove,
  onReorder,
  onSelectedChange,
  onToggleEnabled,
  selected,
}: {
  canToggleMods: boolean;
  groups: ModGroup[];
  mods: OutputMod[];
  onMove: (modids: string[], groupId: string | null) => void;
  onRemove: (mod: OutputMod) => void;
  onReorder: (activeId: string, overId: string) => void;
  onSelectedChange: (modid: string, selected: boolean) => void;
  onToggleEnabled: (mod: OutputMod, enabled: boolean) => void;
  selected: Set<string>;
}) {
  const { t } = useTranslation();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const ids = useMemo(() => mods.map((installed) => installed.path), [mods]);
  const nameByPath = useMemo(
    () => new Map(mods.map((installed) => [installed.path, installed.name])),
    [mods],
  );

  const announcements = useMemo<Announcements>(() => {
    const nameFor = (id: UniqueIdentifier) => nameByPath.get(String(id)) ?? "";
    const positionFor = (id: UniqueIdentifier) =>
      mods.findIndex((installed) => installed.path === String(id)) + 1;
    return {
      onDragStart: ({ active }) => t("mods.installed.order.lifted", { name: nameFor(active.id) }),
      onDragOver: ({ active, over }) =>
        over && over.id !== active.id
          ? t("mods.installed.order.moved", {
              name: nameFor(active.id),
              position: positionFor(over.id),
              total: mods.length,
            })
          : undefined,
      onDragEnd: ({ active, over }) =>
        over
          ? t("mods.installed.order.dropped", {
              name: nameFor(active.id),
              position: positionFor(over.id),
              total: mods.length,
            })
          : undefined,
      onDragCancel: ({ active }) =>
        t("mods.installed.order.cancelled", { name: nameFor(active.id) }),
    };
  }, [mods, nameByPath, t]);

  const finishDrag = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const activeMod = mods.find((installed) => installed.path === String(active.id));
    const overMod = mods.find((installed) => installed.path === String(over.id));
    // Two installed copies of one modid share a slot in the saved order.
    if (!activeMod || !overMod || activeMod.modid === overMod.modid) return;
    onReorder(activeMod.modid, overMod.modid);
  };

  return (
    <DndContext
      accessibility={{
        announcements,
        screenReaderInstructions: { draggable: t("mods.installed.order.instructions") },
      }}
      collisionDetection={closestCenter}
      modifiers={[restrictToVerticalAxis]}
      onDragEnd={finishDrag}
      sensors={sensors}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <div className="grid gap-1.5">
          {mods.map((installed) => (
            <SortableModRow key={installed.path} path={installed.path}>
              {(handle) => (
                <InstalledModRow
                  canToggleMods={canToggleMods}
                  dragHandle={
                    <Button
                      {...handle.listeners}
                      {...handle.attributes}
                      ref={handle.ref}
                      aria-label={t("mods.installed.order.handle")}
                      className="text-muted-foreground cursor-grab touch-none active:cursor-grabbing"
                      size="icon-sm"
                      title={t("mods.installed.order.handle")}
                      variant="ghost"
                    >
                      <GripVertical />
                    </Button>
                  }
                  groups={groups}
                  installed={installed}
                  onMove={onMove}
                  onRemove={onRemove}
                  onSelectedChange={onSelectedChange}
                  onToggleEnabled={onToggleEnabled}
                  selected={selected.has(installed.modid.toLowerCase())}
                />
              )}
            </SortableModRow>
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

/** Registers one installed mod row as a sortable item. */
function SortableModRow({
  children,
  path,
}: {
  children: (handle: RowHandle) => ReactNode;
  path: string;
}) {
  const { t } = useTranslation();
  const {
    attributes,
    isDragging,
    listeners,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition,
  } = useSortable({
    id: path,
    attributes: { roleDescription: t("mods.installed.order.role") },
  });

  return (
    <div
      className={cn(isDragging && "opacity-40")}
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      {children({ attributes, listeners, ref: setActivatorNodeRef })}
    </div>
  );
}
