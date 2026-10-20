import { Bookmark, Copy, FolderPlus, Power, PowerOff } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * The installed view's header: how many mods are installed and the actions
 * that apply to all of them, plus creating a new group.
 */
export function InstalledModsToolbar({
  applyPending,
  canToggleMods,
  creatingGroup,
  modCount,
  newGroupName,
  onApplyAll,
  onCancelCreate,
  onCopyAll,
  onCreateGroup,
  onNewGroupNameChange,
  onOpenPresets,
  onStartCreate,
}: {
  applyPending: boolean;
  canToggleMods: boolean;
  creatingGroup: boolean;
  modCount: number;
  newGroupName: string;
  onApplyAll: (enabled: boolean) => void;
  onCancelCreate: () => void;
  onCopyAll: () => void;
  onCreateGroup: () => void;
  onNewGroupNameChange: (name: string) => void;
  onOpenPresets: () => void;
  onStartCreate: () => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="text-muted-foreground text-xs">
        {t("mods.installed.count", { count: modCount })}
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
