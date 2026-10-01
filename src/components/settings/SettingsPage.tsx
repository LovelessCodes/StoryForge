import { useQueryClient } from "@tanstack/react-query";
import { DownloadIcon, MoonIcon, RefreshCwIcon, ZapIcon } from "lucide-react";
import { useTheme } from "next-themes";
import type { ReactNode } from "react";
import { useState } from "react";

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
import { type SortBy, sortOptions } from "@/lib/mod-sort";
import { toast } from "@/lib/notify";
import { useSettingsStore } from "@/stores/settings";

import AccountCard from "./AccountCard";
import DataFoldersCard from "./DataFoldersCard";
import LogViewer from "./LogViewer";

const sortItems = (Object.keys(sortOptions) as SortBy[]).map((key) => ({
  label: sortOptions[key],
  value: key,
}));

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
  const isDark = resolvedTheme === "dark";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MoonIcon className="size-4" />
          Appearance
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        <SettingRow description="Use the dark theme across the app." label="Dark mode">
          <Switch
            aria-label="Dark mode"
            checked={isDark}
            onCheckedChange={(checked) => setTheme(checked ? "dark" : "light")}
          />
        </SettingRow>
      </CardContent>
    </Card>
  );
}

function BehaviourCard() {
  const streamMode = useSettingsStore((s) => s.streamMode);
  const toggleStreamMode = useSettingsStore((s) => s.toggleStreamMode);
  const useSystemDotnet = useSettingsStore((s) => s.useSystemDotnet);
  const toggleUseSystemDotnet = useSettingsStore((s) => s.toggleUseSystemDotnet);
  const defaultModSortBy = useSettingsStore((s) => s.defaultModSortBy);
  const setDefaultModSortBy = useSettingsStore((s) => s.setDefaultModSortBy);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ZapIcon className="size-4" />
          Behaviour
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        <SettingRow
          description="Hide server addresses in server lists, for example while streaming."
          label="Stream mode"
        >
          <Switch
            aria-label="Stream mode"
            checked={streamMode}
            onCheckedChange={() => toggleStreamMode()}
          />
        </SettingRow>

        <SettingRow
          description="Try your system's .NET runtime before downloading one."
          label="Use system .NET"
        >
          <Switch
            aria-label="Use system .NET"
            checked={useSystemDotnet}
            onCheckedChange={() => toggleUseSystemDotnet()}
          />
        </SettingRow>

        <SettingRow
          description="Sort order used when the mod browser opens."
          label="Default mod sort"
        >
          <Select
            items={sortItems}
            onValueChange={(value) => {
              if (value) setDefaultModSortBy(value as SortBy);
            }}
            value={defaultModSortBy}
          >
            <SelectTrigger aria-label="Default mod sort" className="w-40">
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
  const { data: version } = useAppVersion();
  const queryClient = useQueryClient();
  const [checking, setChecking] = useState(false);

  async function checkForUpdates() {
    setChecking(true);
    toast.loading("Checking for updates...", { id: "update-check" });
    try {
      await queryClient.invalidateQueries({ queryKey: ["updater"] });
      toast.success("Update check complete", { id: "update-check" });
    } catch (error) {
      toast.error(
        `Update check failed: ${error instanceof Error ? error.message : String(error)}`,
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
          Updates
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        <SettingRow description="Currently installed version." label="App version">
          <span className="font-mono text-xs">{version ? `v${version}` : "…"}</span>
        </SettingRow>
        <SettingRow
          description="Checks quietly; updates are announced in the title bar."
          label="Updates"
        >
          <Button
            disabled={checking}
            onClick={() => void checkForUpdates()}
            size="sm"
            variant="outline"
          >
            <RefreshCwIcon className={checking ? "animate-spin" : undefined} />
            {checking ? "Checking..." : "Check for updates"}
          </Button>
        </SettingRow>
      </CardContent>
    </Card>
  );
}

export default function SettingsPage() {
  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-lg font-semibold">Settings</h1>
        <p className="text-muted-foreground text-xs">
          Folders, appearance, downloads and the application account.
        </p>
      </div>

      <DataFoldersCard />
      <AppearanceCard />
      <BehaviourCard />
      <UpdatesCard />
      <LogViewer />
      <AccountCard />
    </div>
  );
}
