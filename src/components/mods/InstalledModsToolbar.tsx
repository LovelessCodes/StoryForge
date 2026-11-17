import {
  ArrowDownAZ,
  ArrowUpDown,
  Bookmark,
  Copy,
  FolderPlus,
  Power,
  PowerOff,
} from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { InstalledSort } from "@/lib/mod-order";

/**
 * The installed view's header: how many mods are installed and the actions
 * that apply to all of them, plus creating a new group.
 */
export function InstalledModsToolbar({
  applyPending,
  canToggleMods,
  creatingGroup,
  hasCustomOrder,
  modCount,
  newGroupName,
  onApplyAll,
  onCancelCreate,
  onCopyAll,
  onCreateGroup,
  onNewGroupNameChange,
  onOpenPresets,
  onResetOrder,
  onSortChange,
  onStartCreate,
  sort,
  totalSize,
}: {
  applyPending: boolean;
  canToggleMods: boolean;
  creatingGroup: boolean;
  hasCustomOrder: boolean;
  modCount: number;
  newGroupName: string;
  onApplyAll: (enabled: boolean) => void;
  onCancelCreate: () => void;
  onCopyAll: () => void;
  onCreateGroup: () => void;
  onNewGroupNameChange: (name: string) => void;
  onOpenPresets: () => void;
  onResetOrder: () => void;
  onSortChange: (sort: InstalledSort) => void;
  onStartCreate: () => void;
  sort: InstalledSort;
  /** Total size of the installed zips, already formatted; empty while loading. */
  totalSize: string;
}) {
  const { t } = useTranslation();
  const sortItems = useMemo(
    () =>
      (["manual", "name", "size"] as const).map((value) => ({
        label: t(`mods.installed.sort.${value}`),
        value,
      })),
    [t],
  );

  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="text-muted-foreground text-xs">
        {t("mods.installed.count", { count: modCount })}
        {totalSize ? ` · ${totalSize}` : null}
      </span>
      <div className="flex flex-wrap items-center gap-2">
        {canToggleMods && (
          <>
            <Button
              aria-label={t("mods.groups.enableAll")}
              disabled={applyPending || modCount === 0}
              onClick={() => onApplyAll(true)}
              size="icon-sm"
              title={t("mods.groups.enableAll")}
              variant="outline"
            >
              <Power />
            </Button>
            <Button
              aria-label={t("mods.groups.disableAll")}
              disabled={applyPending || modCount === 0}
              onClick={() => onApplyAll(false)}
              size="icon-sm"
              title={t("mods.groups.disableAll")}
              variant="outline"
            >
              <PowerOff />
            </Button>
            <Button onClick={onOpenPresets} size="sm" variant="outline">
              <Bookmark />
              {t("mods.presets.button")}
            </Button>
          </>
        )}
        <Button disabled={modCount === 0} onClick={onCopyAll} size="sm" variant="outline">
          <Copy />
          {t("mods.copy.button")}
        </Button>
        <Select
          items={sortItems}
          value={sort}
          onValueChange={(value) => {
            if (typeof value === "string") onSortChange(value as InstalledSort);
          }}
        >
          <SelectTrigger aria-label={t("mods.installed.sort.aria")} size="sm">
            <ArrowUpDown className="text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent alignItemWithTrigger={false}>
            {sortItems.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          aria-label={t("mods.installed.order.reset")}
          disabled={!hasCustomOrder}
          onClick={onResetOrder}
          size="icon-sm"
          title={t("mods.installed.order.reset")}
          variant="outline"
        >
          <ArrowDownAZ />
        </Button>
        {creatingGroup ? (
          <div className="flex items-center gap-2">
            <Input
              aria-label={t("mods.groups.namePlaceholder")}
              className="h-8 max-w-48"
              placeholder={t("mods.groups.namePlaceholder")}
              value={newGroupName}
              onChange={(event) => onNewGroupNameChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.nativeEvent.isComposing) return;
                if (event.key === "Enter") onCreateGroup();
                if (event.key === "Escape") onCancelCreate();
              }}
            />
            <Button disabled={newGroupName.trim().length === 0} onClick={onCreateGroup} size="sm">
              {t("mods.groups.create")}
            </Button>
            <Button onClick={onCancelCreate} size="sm" variant="ghost">
              {t("common.actions.cancel")}
            </Button>
          </div>
        ) : (
          <Button onClick={onStartCreate} size="sm" variant="outline">
            <FolderPlus />
            {t("mods.groups.new")}
          </Button>
        )}
      </div>
    </div>
  );
}
