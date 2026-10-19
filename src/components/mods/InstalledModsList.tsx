import { type DraggableAttributes, type DraggableSyntheticListeners } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "cn";
import {
  ChevronDown,
  ChevronRight,
  Ellipsis,
  GripVertical,
  Pencil,
  Power,
  PowerOff,
  Trash2,
} from "lucide-react";
import { useMemo, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { ModGroup, ModSection } from "@/lib/mod-groups";
import { toast } from "@/lib/notify";
import type { OutputMod } from "@/lib/types";

import { InstalledModRow } from "./InstalledModRow";

/** Selected/enabled counts for one section header. */
function sectionState(section: ModSection, selected: Set<string>) {
  const total = section.mods.length;
  const enabled = section.mods.filter((mod) => !mod.disabled).length;
  const selectedHere = section.mods.filter((mod) => selected.has(mod.modid.toLowerCase())).length;
  return { total, enabled, selectedHere };
}

/**
 * The scrollable group list of the installed view: per-section headers with
 * their batch actions, and one row per installed mod.
 */
export function InstalledModsList({
  applyEnabled,
  applyPending,
  canToggleMods,
  collapsed,
  confirmDeleteGroupId,
  deleteModGroup,
  groups,
  mods,
  modsDirectory,
  moveModsToGroup,
  onRemoveMod,
  renameName,
  renamingId,
  saveRename,
  sections,
  selectMod,
  selectSection,
  selected,
  setCollapsed,
  setConfirmDeleteGroupId,
  setModEnabled,
  setRenameName,
  setRenamingId,
}: {
  applyEnabled: (targets: OutputMod[], enabled: boolean) => void;
  applyPending: boolean;
  canToggleMods: boolean;
  collapsed: Set<string>;
  confirmDeleteGroupId: string | null;
  deleteModGroup: (modsDirectory: string, groupId: string) => void;
  groups: ModGroup[];
  mods: OutputMod[];
  modsDirectory: string;
  moveModsToGroup: (modsDirectory: string, modids: string[], groupId: string | null) => void;
  onRemoveMod: (mod: OutputMod) => void;
  renameName: string;
  renamingId: string | null;
  saveRename: (groupId: string) => void;
  sections: ModSection[];
  selectMod: (modid: string, isSelected: boolean) => void;
  selectSection: (section: ModSection, isSelected: boolean) => void;
  selected: Set<string>;
  setCollapsed: Dispatch<SetStateAction<Set<string>>>;
  setConfirmDeleteGroupId: (groupId: string | null) => void;
  setModEnabled: (params: {
    enabled: boolean;
    modid: string;
    name: string;
    version: string;
  }) => void;
  setRenameName: (name: string) => void;
  setRenamingId: (groupId: string | null) => void;
}) {
  const { t } = useTranslation();
  const groupIds = useMemo(() => groups.map((group) => group.id), [groups]);

  return (
    <ScrollArea scrollFade className="min-h-0 flex-1">
      <SortableContext items={groupIds} strategy={verticalListSortingStrategy}>
        <div className={cn("grid gap-3 pr-1", selected.size > 0 ? "pb-16" : "pb-1")}>
          {mods.length === 0 ? (
            <p className="text-muted-foreground border border-dashed p-6 text-center text-xs">
              {t("mods.installed.empty")}
            </p>
          ) : (
            sections.map((section) => {
              const key = section.group?.id ?? "__ungrouped__";
              const isCollapsed = collapsed.has(key);
              const { total, enabled, selectedHere } = sectionState(section, selected);

              const content = (handle: DragHandle | null) => (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    {handle && (
                      <Button
                        {...handle.listeners}
                        {...handle.attributes}
                        ref={handle.ref}
                        aria-label={t("mods.groups.dragHandle")}
                        className="text-muted-foreground cursor-grab touch-none active:cursor-grabbing"
                        size="icon-sm"
                        title={t("mods.groups.dragHandle")}
                        variant="ghost"
                      >
                        <GripVertical />
                      </Button>
                    )}
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
                            if (event.nativeEvent.isComposing) return;
                            if (event.key === "Enter" && section.group)
                              saveRename(section.group.id);
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
                            disabled={applyPending || total === 0}
                            onClick={() => applyEnabled(section.mods, true)}
                            size="icon-sm"
                            title={t("mods.groups.enableAll")}
                            variant="ghost"
                          >
                            <Power />
                          </Button>
                          <Button
                            aria-label={t("mods.groups.disableAll")}
                            disabled={applyPending || total === 0}
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
                        <Button
                          onClick={() => setConfirmDeleteGroupId(null)}
                          size="sm"
                          variant="ghost"
                        >
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
                            onRemove={onRemoveMod}
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
                </>
              );

              if (!section.group) {
                return (
                  <section className="grid gap-1.5" key={key}>
                    {content(null)}
                  </section>
                );
              }

              return (
                <SortableGroup groupId={section.group.id} key={key}>
                  {content}
                </SortableGroup>
              );
            })
          )}
        </div>
      </SortableContext>
    </ScrollArea>
  );
}

/** Grip props the sortable wrapper hands to a group header. */
type DragHandle = {
  attributes: DraggableAttributes;
  listeners: DraggableSyntheticListeners;
  ref: (element: HTMLElement | null) => void;
};

/**
 * Registers one group section as a sortable item. The section markup renders
 * through `children`, which receives the grip props for its header; the
 * ungrouped section renders as a plain section without them.
 */
function SortableGroup({
  children,
  groupId,
}: {
  children: (handle: DragHandle) => ReactNode;
  groupId: string;
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
  } = useSortable({ id: groupId, attributes: { roleDescription: t("mods.groups.a11yRole") } });

  return (
    <section
      className={cn("grid gap-1.5", isDragging && "opacity-40")}
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      {children({ attributes, listeners, ref: setActivatorNodeRef })}
    </section>
  );
}
