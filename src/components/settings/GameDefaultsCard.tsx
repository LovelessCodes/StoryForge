import { invoke } from "@tauri-apps/api/core";
import { formatDistanceToNow } from "date-fns";
import { Gamepad2, Loader2, RefreshCw, Trash2, Upload } from "lucide-react";
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
import { gameDefaultsCounts, type GameDefaults } from "@/lib/game-defaults";
import { useDateLocale } from "@/lib/i18n/date-locale";
import { toast } from "@/lib/notify";
import { useProfilesStore } from "@/stores/profiles";
import { useSettingsStore } from "@/stores/settings";

/**
 * One set of key bindings, game and video settings shared by every profile:
 * captured from one profile and merged into each profile's clientsettings.json
 * right before the game launches (profiles can opt out in their own settings).
 */
export default function GameDefaultsCard() {
  const { t } = useTranslation();
  const dateLocale = useDateLocale();
  const applyGameDefaults = useSettingsStore((s) => s.applyGameDefaults);
  const setApplyGameDefaults = useSettingsStore((s) => s.setApplyGameDefaults);
  const gameDefaults = useSettingsStore((s) => s.gameDefaults);
  const setGameDefaults = useSettingsStore((s) => s.setGameDefaults);
  const profiles = useProfilesStore((s) => s.profiles);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [sourceId, setSourceId] = useState<number | null>(null);
  const [includeSession, setIncludeSession] = useState(false);
  const [capturing, setCapturing] = useState(false);

  // Reset the form every time the sheet opens (render-time reset keeps the
  // previous pick from leaking into the next capture).
  const [prevPickerOpen, setPrevPickerOpen] = useState(pickerOpen);
  if (pickerOpen !== prevPickerOpen) {
    setPrevPickerOpen(pickerOpen);
    if (pickerOpen) {
      setSourceId(null);
      setIncludeSession(false);
    }
  }

  const counts = gameDefaults ? gameDefaultsCounts(gameDefaults) : null;
  const capturedAgo =
    gameDefaults?.capturedAt !== undefined
      ? formatDistanceToNow(new Date(gameDefaults.capturedAt), {
          addSuffix: true,
          locale: dateLocale,
        })
      : null;

  async function capture() {
    if (sourceId === null) return;
    setCapturing(true);
    try {
      const snapshot = await invoke<GameDefaults>("capture_game_defaults", {
        profileId: sourceId,
        includeAccountSession: includeSession,
      });
      setGameDefaults(snapshot);
      setPickerOpen(false);
      setSourceId(null);
      setIncludeSession(false);
      toast.success(t("settings.gameDefaults.captured"));
    } catch (error) {
      toast.error(t("settings.gameDefaults.captureFailed"), {
        description: (error as Error)?.message ?? String(error),
      });
    } finally {
      setCapturing(false);
    }
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
            checked={applyGameDefaults}
            disabled={!gameDefaults}
            onCheckedChange={setApplyGameDefaults}
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border p-3">
          <div className="grid min-w-0 gap-0.5">
            <span className="truncate text-xs font-medium">
              {gameDefaults
                ? t("settings.gameDefaults.capturedFrom", {
                    name: gameDefaults.sourceProfile ?? "",
                  })
                : t("settings.gameDefaults.none")}
            </span>
            {gameDefaults && counts && (
              <span className="text-muted-foreground text-[11px]">
                {t("settings.gameDefaults.counts", {
                  keys: counts.keyBindings,
                  settings: counts.settings,
                })}
                {gameDefaults.includesAccount
                  ? ` · ${t("settings.gameDefaults.includesSession")}`
                  : ""}
                {capturedAgo ? ` · ${capturedAgo}` : ""}
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
              {gameDefaults ? <RefreshCw /> : <Upload />}
              {gameDefaults
                ? t("settings.gameDefaults.recapture")
                : t("settings.gameDefaults.capture")}
            </Button>
            {gameDefaults && (
              <Button
                onClick={() => {
                  setGameDefaults(null);
                  setApplyGameDefaults(false);
                  toast.success(t("settings.gameDefaults.cleared"));
                }}
                size="sm"
                variant="ghost"
              >
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
                value={sourceId === null ? "" : String(sourceId)}
                onValueChange={(value) => {
                  if (value) setSourceId(Number(value));
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
              <Switch checked={includeSession} onCheckedChange={setIncludeSession} />
            </div>
          </div>
          <SheetFooter className="border-t">
            <div className="flex justify-end gap-2">
              <SheetClose render={<Button disabled={capturing} variant="outline" />}>
                {t("common.actions.cancel")}
              </SheetClose>
              <Button
                disabled={capturing || sourceId === null}
                onClick={() => void capture()}
                variant="accent-primary"
              >
                {capturing && <Loader2 className="animate-spin" />}
                {t("settings.gameDefaults.capture")}
              </Button>
            </div>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </Card>
  );
}
