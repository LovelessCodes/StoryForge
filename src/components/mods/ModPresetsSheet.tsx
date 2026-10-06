import { Bookmark, Loader2, Play, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useInstalledMods } from "@/hooks/use-installed-mods";
import { useApplyModState } from "@/hooks/use-set-mod-enabled";
import { toast } from "@/lib/notify";
import { useSettingsStore, type ModPreset } from "@/stores/settings";

/** Stable empty list so the selector doesn't churn identities. */
const NO_PRESETS: ModPreset[] = [];

/**
 * Named enabled/disabled presets for one profile.
 *
 * A preset captures the set of mods that are disabled at the moment it is
 * saved; applying it disables exactly those installed mods and enables every
 * other installed mod, in a single write to the profile's clientsettings.
 * Mods installed later are unaffected until the preset is applied again — and
 * then they are enabled, since the preset doesn't name them.
 */
export function ModPresetsSheet({
  modsDirectory,
  onOpenChange,
  open,
}: {
  modsDirectory?: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const { t } = useTranslation();
  const { data } = useInstalledMods(modsDirectory ?? "", { enabled: open && !!modsDirectory });
  const presets = useSettingsStore((s) =>
    modsDirectory ? (s.modPresets[modsDirectory] ?? NO_PRESETS) : NO_PRESETS,
  );
  const saveModPreset = useSettingsStore((s) => s.saveModPreset);
  const deleteModPreset = useSettingsStore((s) => s.deleteModPreset);
  const applyState = useApplyModState(modsDirectory);
  const [name, setName] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [applyingId, setApplyingId] = useState<string | null>(null);

  const installed = useMemo(() => data?.mods ?? [], [data]);
  const disabledCount = installed.filter((mod) => mod.disabled).length;

  const save = () => {
    const trimmed = name.trim();
    if (!modsDirectory || !trimmed) return;
    saveModPreset(modsDirectory, {
      name: trimmed,
      disabled: installed.filter((mod) => mod.disabled).map((mod) => mod.modid),
    });
    toast.success(t("mods.presets.saved", { name: trimmed }));
    setName("");
  };

  const apply = (preset: ModPreset) => {
    setApplyingId(preset.id);
    applyState.mutate(preset.disabled, {
      onSuccess: () => toast.success(t("mods.presets.applied", { name: preset.name })),
      onSettled: () => setApplyingId(null),
    });
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!applyState.isPending) onOpenChange(next);
      }}
    >
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b">
          <SheetTitle className="flex items-center gap-2">
            <Bookmark className="size-4" />
            {t("mods.presets.title")}
          </SheetTitle>
          <SheetDescription>{t("mods.presets.description")}</SheetDescription>
        </SheetHeader>

        <ScrollArea scrollFade className="min-h-0 flex-1">
          <div className="grid gap-4 p-4">
            <div className="grid gap-1.5">
              <label className="text-xs font-medium" htmlFor="preset-name">
                {t("mods.presets.save")}
              </label>
              <div className="flex items-center gap-2">
                <Input
                  id="preset-name"
                  placeholder={t("mods.presets.namePlaceholder")}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") save();
                  }}
                />
                <Button
                  disabled={!modsDirectory || name.trim().length === 0}
                  onClick={save}
                  size="sm"
                  variant="accent-primary"
                >
                  <Bookmark />
                  {t("mods.presets.saveAction")}
                </Button>
              </div>
              <p className="text-muted-foreground text-[11px]">
                {t("mods.presets.currentState", { count: disabledCount })}
              </p>
            </div>

            <div className="grid gap-2">
              {presets.length === 0 ? (
                <p className="text-muted-foreground text-xs">{t("mods.presets.empty")}</p>
              ) : (
                presets.map((preset) => (
                  <div key={preset.id} className="flex items-center gap-2 border p-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{preset.name}</p>
                      <p className="text-muted-foreground text-[11px]">
                        {t("mods.presets.disabledCount", { count: preset.disabled.length })}
                      </p>
                    </div>
                    {confirmDeleteId === preset.id ? (
                      <>
                        <span className="text-destructive text-[11px]">
                          {t("mods.presets.deleteConfirm")}
                        </span>
                        <Button size="sm" variant="ghost" onClick={() => setConfirmDeleteId(null)}>
                          {t("common.actions.cancel")}
                        </Button>
                        <Button
                          disabled={applyState.isPending}
                          onClick={() => {
                            setConfirmDeleteId(null);
                            deleteModPreset(modsDirectory ?? "", preset.id);
                            toast.success(t("mods.presets.deleted", { name: preset.name }));
                          }}
                          size="sm"
                          variant="destructive"
                        >
                          <Trash2 />
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button
                          disabled={applyState.isPending}
                          onClick={() => apply(preset)}
                          size="sm"
                          variant="outline"
                        >
                          {applyingId === preset.id ? (
                            <Loader2 className="animate-spin" />
                          ) : (
                            <Play />
                          )}
                          {t("mods.presets.apply")}
                        </Button>
                        <Button
                          aria-label={t("mods.presets.delete", { name: preset.name })}
                          className="text-muted-foreground hover:text-destructive"
                          disabled={applyState.isPending}
                          onClick={() => setConfirmDeleteId(preset.id)}
                          size="icon-sm"
                          title={t("mods.presets.deleteTitle")}
                          variant="ghost"
                        >
                          <Trash2 />
                        </Button>
                      </>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
