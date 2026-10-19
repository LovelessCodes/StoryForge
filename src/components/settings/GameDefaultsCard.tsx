import { type UseQueryResult, useQuery } from "@tanstack/react-query";
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
import { useProfilesStore, type Profile } from "@/stores/profiles";
import { useSettingsStore } from "@/stores/settings";

/** Master switch row of the card. */
function ApplyDefaultsRow({
  apply,
  hasSource,
  onApplyChange,
}: {
  apply: boolean;
  hasSource: boolean;
  onApplyChange: (apply: boolean) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="grid gap-0.5">
        <span className="text-xs font-medium">{t("settings.gameDefaults.applyLabel")}</span>
        <span className="text-muted-foreground text-[11px]">
          {t("settings.gameDefaults.applyDescription")}
        </span>
      </div>
      <Switch checked={apply && hasSource} disabled={!hasSource} onCheckedChange={onApplyChange} />
    </div>
  );
}

/** Source profile name plus the live key-binding and settings preview. */
function GameDefaultsSourceStatus({
  missing,
  preview,
  profile,
}: {
  missing: boolean;
  preview: UseQueryResult<GameDefaultsPreview, Error>;
  profile: Profile | null;
}) {
  const { t } = useTranslation();
  return (
    <div className="grid min-w-0 gap-0.5">
      <span className="truncate text-xs font-medium">
        {missing
          ? t("settings.gameDefaults.sourceMissing")
          : profile
            ? t("settings.gameDefaults.capturedFrom", { name: profile.name })
            : t("settings.gameDefaults.none")}
      </span>
      {profile && (
        <span className="text-muted-foreground text-[11px]">
          {preview.isPending
            ? "…"
            : preview.error
              ? (preview.error as Error).message
              : t("settings.gameDefaults.counts", {
                  keys: preview.data?.keyBindings ?? 0,
                  settings: preview.data?.settings ?? 0,
                })}
          {preview.data?.includesAccount ? ` · ${t("settings.gameDefaults.includesSession")}` : ""}
        </span>
      )}
    </div>
  );
}

/** Capture/recapture and clear buttons for the source profile. */
function GameDefaultsSourceActions({
  hasProfiles,
  hasSourceId,
  onCapture,
  onClear,
}: {
  hasProfiles: boolean;
  hasSourceId: boolean;
  onCapture: () => void;
  onClear: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex gap-2">
      <Button disabled={!hasProfiles} onClick={onCapture} size="sm" variant="outline">
        {hasSourceId ? <RefreshCw /> : <Upload />}
        {hasSourceId ? t("settings.gameDefaults.recapture") : t("settings.gameDefaults.capture")}
      </Button>
      {hasSourceId && (
        <Button onClick={onClear} size="sm" variant="ghost">
          <Trash2 />
          {t("settings.gameDefaults.clear")}
        </Button>
      )}
    </div>
  );
}

/** Sheet that picks which profile the defaults are captured from. */
function GameDefaultsPickerSheet({
  onApply,
  onIncludeChange,
  onOpenChange,
  onPick,
  open,
  pickedId,
  pickedInclude,
  profiles,
}: {
  onApply: () => void;
  onIncludeChange: (include: boolean) => void;
  onOpenChange: (open: boolean) => void;
  onPick: (id: number) => void;
  open: boolean;
  pickedId: number | null;
  pickedInclude: boolean;
  profiles: Profile[];
}) {
  const { t } = useTranslation();
  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
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
                if (value) onPick(Number(value));
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
            <Switch checked={pickedInclude} onCheckedChange={onIncludeChange} />
          </div>
        </div>
        <SheetFooter className="border-t">
          <div className="flex justify-end gap-2">
            <SheetClose render={<Button variant="outline" />}>
              {t("common.actions.cancel")}
            </SheetClose>
            <Button disabled={pickedId === null} onClick={onApply} variant="accent-primary">
              {t("settings.gameDefaults.capture")}
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

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
        <ApplyDefaultsRow
          apply={applyGameDefaults}
          hasSource={sourceProfile !== null}
          onApplyChange={setApplyGameDefaults}
        />

        <div className="flex flex-wrap items-center justify-between gap-3 border p-3">
          <GameDefaultsSourceStatus
            missing={sourceMissing}
            preview={preview}
            profile={sourceProfile}
          />
          <GameDefaultsSourceActions
            hasProfiles={profiles.length > 0}
            hasSourceId={sourceProfileId !== null}
            onCapture={() => setPickerOpen(true)}
            onClear={clear}
          />
        </div>
      </CardContent>

      <GameDefaultsPickerSheet
        onApply={applyPick}
        onIncludeChange={setPickedInclude}
        onOpenChange={setPickerOpen}
        onPick={setPickedId}
        open={pickerOpen}
        pickedId={pickedId}
        pickedInclude={pickedInclude}
        profiles={profiles}
      />
    </Card>
  );
}
