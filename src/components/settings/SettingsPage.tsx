import { useQueryClient } from "@tanstack/react-query";
import { locale } from "@tauri-apps/plugin-os";
import { DownloadIcon, MoonIcon, RefreshCwIcon, ZapIcon } from "lucide-react";
import { useTheme } from "next-themes";
import type { ReactNode } from "react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useAppVersion } from "@/hooks/use-app-version";
import { errorMessage } from "@/lib/errors";
import { LOCALES, resolveLocale } from "@/lib/i18n";
import { type SortBy, sortOptions } from "@/lib/mod-sort";
import { toast } from "@/lib/notify";
import { elementCenter, switchTheme } from "@/lib/theme-transition";
import { useSettingsStore } from "@/stores/settings";

import AccountCard from "./AccountCard";
import DataFoldersCard from "./DataFoldersCard";
import GameDefaultsCard from "./GameDefaultsCard";
import LogViewer from "./LogViewer";

function SettingRow({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="grid gap-0.5">
        <span className="text-xs font-medium">{label}</span>
        {description ? (
          <span className="text-muted-foreground text-[11px]">{description}</span>
        ) : null}
      </div>
      {children}
    </div>
  );
}

function AppearanceCard() {
  const { resolvedTheme, setTheme } = useTheme();
  const { i18n, t } = useTranslation();
  const language = useSettingsStore((s) => s.language);
  const setLanguage = useSettingsStore((s) => s.setLanguage);
  const isDark = resolvedTheme === "dark";
  const switchRef = useRef<HTMLSpanElement>(null);

  const languageItems = [
    { label: t("settings.appearance.systemLanguage"), value: "system" },
    ...LOCALES.map((entry) => ({ label: entry.label, value: entry.code })),
  ];

  async function changeLanguage(next: string) {
    setLanguage(next);
    let systemLocale: string | null = null;
    try {
      systemLocale = await locale();
    } catch {
      // Browser dev without the OS plugin.
    }
    await i18n.changeLanguage(resolveLocale(next, systemLocale));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MoonIcon className="size-4" />
          {t("settings.appearance.title")}
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        <SettingRow
          description={t("settings.appearance.darkModeDescription")}
          label={t("settings.appearance.darkMode")}
        >
          <span ref={switchRef} className="inline-flex">
            <Switch
              aria-label={t("settings.appearance.darkMode")}
              checked={isDark}
              onCheckedChange={(checked) =>
                switchTheme(checked ? "dark" : "light", {
                  origin: elementCenter(switchRef.current),
                  setTheme,
                })
              }
            />
          </span>
        </SettingRow>
        <SettingRow
          description={t("settings.appearance.languageDescription")}
          label={t("settings.appearance.language")}
        >
          <Select
            items={languageItems}
            value={language}
            onValueChange={(value) => {
              if (value) void changeLanguage(value);
            }}
          >
            <SelectTrigger aria-label={t("settings.appearance.language")} className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="start" alignItemWithTrigger={false}>
              {languageItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingRow>
      </CardContent>
    </Card>
  );
}

function BehaviourCard() {
  const { t } = useTranslation();
  const streamMode = useSettingsStore((s) => s.streamMode);
  const toggleStreamMode = useSettingsStore((s) => s.toggleStreamMode);
  const useSystemDotnet = useSettingsStore((s) => s.useSystemDotnet);
  const toggleUseSystemDotnet = useSettingsStore((s) => s.toggleUseSystemDotnet);
  const defaultModSortBy = useSettingsStore((s) => s.defaultModSortBy);
  const setDefaultModSortBy = useSettingsStore((s) => s.setDefaultModSortBy);

  const sortItems = (Object.keys(sortOptions) as SortBy[]).map((key) => ({
    label: t(`settings.behaviour.sort.${key}`),
    value: key,
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ZapIcon className="size-4" />
          {t("settings.behaviour.title")}
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        <SettingRow
          description={t("settings.behaviour.streamModeDescription")}
          label={t("settings.behaviour.streamMode")}
        >
          <Switch
            aria-label={t("settings.behaviour.streamMode")}
            checked={streamMode}
            onCheckedChange={() => toggleStreamMode()}
          />
        </SettingRow>

        <SettingRow
          description={t("settings.behaviour.systemDotnetDescription")}
          label={t("settings.behaviour.systemDotnet")}
        >
          <Switch
            aria-label={t("settings.behaviour.systemDotnet")}
            checked={useSystemDotnet}
            onCheckedChange={() => toggleUseSystemDotnet()}
          />
        </SettingRow>

        <SettingRow
          description={t("settings.behaviour.defaultModSortDescription")}
          label={t("settings.behaviour.defaultModSort")}
        >
          <Select
            items={sortItems}
            onValueChange={(value) => {
              if (value) setDefaultModSortBy(value as SortBy);
            }}
            value={defaultModSortBy}
          >
            <SelectTrigger aria-label={t("settings.behaviour.defaultModSort")} className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {sortItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingRow>
      </CardContent>
    </Card>
  );
}

function UpdatesCard() {
  const { t } = useTranslation();
  const { data: version } = useAppVersion();
  const queryClient = useQueryClient();
  const [checking, setChecking] = useState(false);

  async function checkForUpdates() {
    setChecking(true);
    toast.loading(t("settings.updates.checkingToast"), { id: "update-check" });
    try {
      await queryClient.invalidateQueries({ queryKey: ["updater"] });
      toast.success(t("settings.updates.checkComplete"), { id: "update-check" });
    } catch (error) {
      toast.error(
        t("settings.updates.checkFailed", {
          message: errorMessage(error),
        }),
        { id: "update-check" },
      );
    } finally {
      setChecking(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <DownloadIcon className="size-4" />
          {t("settings.updates.title")}
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        <SettingRow
          description={t("settings.updates.appVersionDescription")}
          label={t("settings.updates.appVersion")}
        >
          <span className="font-mono text-xs">{version ? `v${version}` : "…"}</span>
        </SettingRow>
        <SettingRow
          description={t("settings.updates.description")}
          label={t("settings.updates.label")}
        >
          <Button
            disabled={checking}
            onClick={() => void checkForUpdates()}
            size="sm"
            variant="outline"
          >
            <RefreshCwIcon className={checking ? "animate-spin" : undefined} />
            {checking ? t("settings.updates.checking") : t("settings.updates.check")}
          </Button>
        </SettingRow>
      </CardContent>
    </Card>
  );
}

export default function SettingsPage() {
  return (
    <div className="grid gap-6">
      <DataFoldersCard />
      <AppearanceCard />
      <BehaviourCard />
      <GameDefaultsCard />
      <UpdatesCard />
      <LogViewer />
      <AccountCard />
    </div>
  );
}
