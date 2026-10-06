import { FolderInput, Trash2 } from "lucide-react";
import { useState } from "react";
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
import { Switch } from "@/components/ui/switch";
import type { ModGroup } from "@/lib/mod-groups";
import type { OutputMod } from "@/lib/types";

/**
 * One installed mod in the installed view: selection, identity, the group it
 * belongs to (via "move to"), the enabled switch and a remove button.
 */
export function InstalledModRow({
  canToggleMods,
  groups,
  installed,
  onMove,
  onRemove,
  onSelectedChange,
  onToggleEnabled,
  selected,
}: {
  canToggleMods: boolean;
  groups: ModGroup[];
  installed: OutputMod;
  onMove: (modids: string[], groupId: string | null) => void;
  onRemove: (installed: OutputMod) => void;
  onSelectedChange: (modid: string, selected: boolean) => void;
  onToggleEnabled: (installed: OutputMod, enabled: boolean) => void;
  selected: boolean;
}) {
  const { t } = useTranslation();
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const disabled = installed.disabled ?? false;
  const filename = installed.path.split(/[/\\]/).filter(Boolean).pop() ?? installed.path;

  return (
    <div className="hover:bg-muted/40 flex items-center gap-3 border p-2.5 transition-colors">
      <Checkbox
        aria-label={t("mods.installed.select", { name: installed.name })}
        checked={selected}
        onCheckedChange={(checked) => onSelectedChange(installed.modid, checked === true)}
      />

      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-medium">{installed.name}</span>
          <span className="text-muted-foreground shrink-0 font-mono text-[11px]">
            v{installed.version}
          </span>
        </div>
        <p className="text-muted-foreground truncate font-mono text-[10px]" title={filename}>
          {filename}
        </p>
      </div>

      {confirmingRemove ? (
        <>
          <span className="text-destructive shrink-0 text-[11px]">
            {t("mods.installed.removeConfirm", { count: 1 })}
          </span>
          <Button size="sm" variant="ghost" onClick={() => setConfirmingRemove(false)}>
            {t("common.actions.cancel")}
          </Button>
          <Button
            onClick={() => {
              setConfirmingRemove(false);
              onRemove(installed);
            }}
            size="sm"
            variant="destructive"
          >
            <Trash2 />
          </Button>
        </>
      ) : (
        <>
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
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>{t("mods.installed.moveToGroup")}</DropdownMenuLabel>
              <DropdownMenuItem
                className="text-nowrap"
                onClick={() => onMove([installed.modid], null)}
              >
                {t("mods.installed.ungrouped")}
              </DropdownMenuItem>
              {groups.length > 0 && <DropdownMenuSeparator />}
              {groups.map((group) => (
                <DropdownMenuItem
                  className="text-nowrap"
                  key={group.id}
                  onClick={() => onMove([installed.modid], group.id)}
                >
                  {group.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {canToggleMods && (
            <Switch
              aria-label={
                disabled
                  ? t("mods.item.enableTooltip", { name: installed.name })
                  : t("mods.item.disableTooltip", { name: installed.name })
              }
              checked={!disabled}
              onCheckedChange={(checked) => onToggleEnabled(installed, checked)}
            />
          )}

          <Button
            aria-label={t("mods.installed.removeMod", { name: installed.name })}
            className="text-muted-foreground hover:text-destructive"
            onClick={() => setConfirmingRemove(true)}
            size="icon-sm"
            title={t("common.actions.remove")}
            variant="ghost"
          >
            <Trash2 />
          </Button>
        </>
      )}
    </div>
  );
}
