import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { Gamepad2, RefreshCw, Trash2, Upload } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import type { GameDefaultsPreview } from "@/lib/game-defaults";
import { toast } from "@/lib/notify";
import { useProfilesStore } from "@/stores/profiles";
import { useSettingsStore } from "@/stores/settings";

/**
 * One profile's key bindings, game and video settings shared with every other
 * profile: the source is read live at each launch, so changes made there carry
 * over automatically. The source profile itself is never overwritten.
 */
export default function GameDefaultsCard() {
  const { t } = useTranslation();
  const applyGameDefaults = useSettingsStore((s) => s.applyGameDefaults);
  const setApplyGameDefaults = useSettingsStore((s) => s.setApplyGameDefaults);
  const sourceProfileId = useSettingsStore((s) => s.gameDefaultsProfileId);
  const setSourceProfileId = useSettingsStore((s) => s.setGameDefaultsProfileId);
  const includeAccount = useSettingsStore((s) => s.gameDefaultsIncludeAccount);
  const setIncludeAccount = useSettingsStore((s) => s.setGameDefaultsIncludeAccount);
  const profiles = useProfilesStore((s) => s.profiles);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickedId, setPickedId] = useState<number | null>(null);
  const [pickedInclude, setPickedInclude] = useState(false);

  // Reset the form every time the sheet opens (render-time reset keeps the
  // current choice offered as the starting point).
  const [prevPickerOpen, setPrevPickerOpen] = useState(pickerOpen);
  if (pickerOpen !== prevPickerOpen) {
    setPrevPickerOpen(pickerOpen);
    if (pickerOpen) {
      setPickedId(sourceProfileId);
      setPickedInclude(includeAccount);
    }
  }

  const sourceProfile = profiles.find((profile) => profile.id === sourceProfileId) ?? null;
  const sourceMissing = sourceProfileId !== null && sourceProfile === null;

  const preview = useQuery({
    queryKey: ["gameDefaultsPreview", sourceProfileId, includeAccount],
    queryFn: () =>
      invoke<GameDefaultsPreview>("preview_game_defaults", {
        profileId: sourceProfileId as number,
        includeAccountSession: includeAccount,
      }),
    enabled: sourceProfileId !== null && !sourceMissing,
    staleTime: 30_000,
  });

  function applyPick() {
    if (pickedId === null) return;
    setSourceProfileId(pickedId);
    setIncludeAccount(pickedInclude);
    setPickerOpen(false);
    toast.success(t("settings.gameDefaults.captured"));
  }

  function clear() {
    setSourceProfileId(null);
    setIncludeAccount(false);
    setApplyGameDefaults(false);
    toast.success(t("settings.gameDefaults.cleared"));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Gamepad2 className="size-4" />
          {t("settings.gameDefaults.title")}
        </CardTitle>
        <CardDescription>{t("settings.gameDefaults.description")}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="flex items-center justify-between gap-4">
          <div className="grid gap-0.5">
            <span className="text-xs font-medium">{t("settings.gameDefaults.applyLabel")}</span>
            <span className="text-muted-foreground text-[11px]">
              {t("settings.gameDefaults.applyDescription")}
            </span>
          </div>
          <Switch
            checked={applyGameDefaults && sourceProfile !== null}
            disabled={!sourceProfile}
            onCheckedChange={setApplyGameDefaults}
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border p-3">
          <div className="grid min-w-0 gap-0.5">
            <span className="truncate text-xs font-medium">
              {sourceMissing
                ? t("settings.gameDefaults.sourceMissing")
                : sourceProfile
                  ? t("settings.gameDefaults.capturedFrom", { name: sourceProfile.name })
                  : t("settings.gameDefaults.none")}
            </span>
            {sourceProfile && (
              <span className="text-muted-foreground text-[11px]">
                {preview.isPending
                  ? "…"
                  : preview.error
                    ? (preview.error as Error).message
                    : t("settings.gameDefaults.counts", {
                        keys: preview.data?.keyBindings ?? 0,
                        settings: preview.data?.settings ?? 0,
                      })}
                {preview.data?.includesAccount
                  ? ` · ${t("settings.gameDefaults.includesSession")}`
                  : ""}
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              disabled={profiles.length === 0}
              onClick={() => setPickerOpen(true)}
              size="sm"
              variant="outline"
            >
              {sourceProfileId !== null ? <RefreshCw /> : <Upload />}
              {sourceProfileId !== null
                ? t("settings.gameDefaults.recapture")
                : t("settings.gameDefaults.capture")}
            </Button>
            {sourceProfileId !== null && (
              <Button onClick={clear} size="sm" variant="ghost">
                <Trash2 />
                {t("settings.gameDefaults.clear")}
              </Button>
            )}
          </div>
        </div>
      </CardContent>

      <Sheet onOpenChange={setPickerOpen} open={pickerOpen}>
        <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-md">
          <SheetHeader className="border-b">
            <SheetTitle>{t("settings.gameDefaults.sheetTitle")}</SheetTitle>
            <SheetDescription>{t("settings.gameDefaults.sheetDescription")}</SheetDescription>
          </SheetHeader>
          <div className="grid gap-4 p-4">
            <div className="grid gap-1.5">
              <span className="text-xs font-medium">{t("settings.gameDefaults.profileLabel")}</span>
              <Select
                items={profiles.map((profile) => ({
                  label: profile.name,
                  value: String(profile.id),
                }))}
                value={pickedId === null ? "" : String(pickedId)}
                onValueChange={(value) => {
                  if (value) setPickedId(Number(value));
                }}
              >
                <SelectTrigger
                  className="w-full"
                  aria-label={t("settings.gameDefaults.profileLabel")}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {profiles.map((profile) => (
                    <SelectItem key={profile.id} value={String(profile.id)}>
                      {profile.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between gap-4">
              <div className="grid gap-0.5">
                <span className="text-xs font-medium">
                  {t("settings.gameDefaults.includeSession")}
                </span>
                <span className="text-muted-foreground text-[11px]">
                  {t("settings.gameDefaults.includeSessionHint")}
                </span>
              </div>
              <Switch checked={pickedInclude} onCheckedChange={setPickedInclude} />
            </div>
          </div>
          <SheetFooter className="border-t">
            <div className="flex justify-end gap-2">
              <SheetClose render={<Button variant="outline" />}>
                {t("common.actions.cancel")}
              </SheetClose>
              <Button disabled={pickedId === null} onClick={applyPick} variant="accent-primary">
                {t("settings.gameDefaults.capture")}
              </Button>
            </div>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </Card>
  );
}
