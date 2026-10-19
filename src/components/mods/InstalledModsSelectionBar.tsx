import { FolderInput, Power, PowerOff, Trash2, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ModGroup } from "@/lib/mod-groups";
import type { OutputMod } from "@/lib/types";

/**
 * The floating bar shown while mods are selected: batch enable/disable, moving
 * the selection into a group and removing it.
 */
export function InstalledModsSelectionBar({
  applyEnabled,
  applyPending,
  canToggleMods,
  confirmBatchRemove,
  groups,
  moveToGroup,
  onClearSelection,
  onRemoveSelected,
  selectedCount,
  selectedMods,
  setConfirmBatchRemove,
}: {
  applyEnabled: (targets: OutputMod[], enabled: boolean) => void;
  applyPending: boolean;
  canToggleMods: boolean;
  confirmBatchRemove: boolean;
  groups: ModGroup[];
  moveToGroup: (groupId: string | null) => void;
  onClearSelection: () => void;
  onRemoveSelected: () => void;
  selectedCount: number;
  selectedMods: OutputMod[];
  setConfirmBatchRemove: (confirm: boolean) => void;
}) {
  const { t } = useTranslation();

  if (selectedCount === 0) return null;

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-3 z-10 flex justify-center">
      <div className="bg-popover text-popover-foreground pointer-events-auto flex items-center gap-1 rounded-full border px-2 py-1.5 shadow-lg">
        <span className="px-1.5 text-xs font-medium">
          {t("mods.installed.selected", { count: selectedCount })}
        </span>
        {canToggleMods && (
          <>
            <Button
              aria-label={t("mods.installed.enable")}
              disabled={applyPending}
              onClick={() => applyEnabled(selectedMods, true)}
              size="icon-sm"
              title={t("mods.installed.enable")}
              variant="ghost"
            >
              <Power />
            </Button>
            <Button
              aria-label={t("mods.installed.disable")}
              disabled={applyPending}
              onClick={() => applyEnabled(selectedMods, false)}
              size="icon-sm"
              title={t("mods.installed.disable")}
              variant="ghost"
            >
              <PowerOff />
            </Button>
          </>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                aria-label={t("mods.installed.moveToGroup")}
                size="icon-sm"
                title={t("mods.installed.moveToGroup")}
                variant="ghost"
              />
            }
          >
            <FolderInput />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center" side="top">
            <DropdownMenuGroup>
              <DropdownMenuLabel>{t("mods.installed.moveToGroup")}</DropdownMenuLabel>
              <DropdownMenuItem className="text-nowrap" onClick={() => moveToGroup(null)}>
                {t("mods.installed.ungrouped")}
              </DropdownMenuItem>
              {groups.length > 0 && <DropdownMenuSeparator />}
              {groups.map((group) => (
                <DropdownMenuItem
                  className="text-nowrap"
                  key={group.id}
                  onClick={() => moveToGroup(group.id)}
                >
                  {group.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        {confirmBatchRemove ? (
          <>
            <span className="text-destructive px-1 text-[11px]">
              {t("mods.installed.removeConfirm", { count: selectedMods.length })}
            </span>
            <Button onClick={() => setConfirmBatchRemove(false)} size="sm" variant="ghost">
              {t("common.actions.cancel")}
            </Button>
            <Button onClick={onRemoveSelected} size="sm" variant="destructive">
              <Trash2 />
              {t("mods.installed.remove")}
            </Button>
          </>
        ) : (
          <Button
            aria-label={t("mods.installed.remove")}
            className="text-muted-foreground hover:text-destructive"
            onClick={() => setConfirmBatchRemove(true)}
            size="icon-sm"
            title={t("mods.installed.remove")}
            variant="ghost"
          >
            <Trash2 />
          </Button>
        )}
        <Button
          aria-label={t("mods.installed.clearSelection")}
          onClick={onClearSelection}
          size="icon-sm"
          title={t("mods.installed.clearSelection")}
          variant="ghost"
        >
          <X />
        </Button>
      </div>
    </div>
  );
}
