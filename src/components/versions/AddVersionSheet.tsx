import { useQuery } from "@tanstack/react-query";
import { openUrl } from "@tauri-apps/plugin-opener";
import { platform } from "@tauri-apps/plugin-os";
import { TriangleAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { Trans, useTranslation } from "react-i18next";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useDownloadManager } from "@/hooks/use-download-manager";
import { useInstalledVersionNames } from "@/hooks/use-installed-versions";
import { compareSemverDesc } from "@/lib/helpers";
import { gameVersionsQuery } from "@/lib/queries";
import { useDownloadStore } from "@/stores/downloads";

export const MAC_WIKI_URL =
  "https://wiki.vintagestory.at/index.php?title=Installing_Vintage_Story_on_macOS";

interface AddVersionSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function AddVersionSheet({ open, onOpenChange }: AddVersionSheetProps) {
  const { t } = useTranslation();
  const { data: gameVersions, isPending } = useQuery(gameVersionsQuery);
  const installedNames = useInstalledVersionNames();
  const installedSet = useMemo(() => new Set(installedNames), [installedNames]);
  const entries = useDownloadStore((s) => s.entries);
  const { startDownload } = useDownloadManager();
  const currentPlatform = platform();

  const [picked, setPicked] = useState<string | null>(null);

  // A fresh sheet always starts on the newest version again.
  const handleOpenChange = (next: boolean) => {
    if (next) setPicked(null);
    onOpenChange(next);
  };

  // Versions with a live entry are installing; finished entries are history.
  const busyVersions = useMemo(
    () =>
      new Set(
        Object.values(entries)
          .filter((entry) => entry.status !== "done")
          .map((entry) => entry.token),
      ),
    [entries],
  );

  const availableVersions = useMemo(
    () => (gameVersions ?? []).toSorted(compareSemverDesc).filter((v) => !busyVersions.has(v)),
    [gameVersions, busyVersions],
  );

  const selectableVersions = useMemo(
    () => availableVersions.filter((v) => !installedSet.has(v)),
    [availableVersions, installedSet],
  );

  // Newest non-rc first, then any newer build, mirroring the old dialog.
  const defaultVersion =
    selectableVersions.find((v) => !v.includes("rc")) ?? selectableVersions[0] ?? "";
  const version = picked ?? defaultVersion;

  const macWarning =
    currentPlatform === "macos" && version !== "" && compareSemverDesc(version, "1.19.0") > 0;

  const submit = () => {
    if (!version || installedSet.has(version) || busyVersions.has(version)) return;
    // A finished download stays in the store as history. It would make
    // startDownload a no-op after the version was deleted and re-added.
    if (useDownloadStore.getState().entries[version]?.status === "done") {
      useDownloadStore.getState().removeEntry(version);
    }
    startDownload(version);
    handleOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b">
          <SheetTitle>{t("versions.add.title")}</SheetTitle>
          <SheetDescription>{t("versions.add.description")}</SheetDescription>
        </SheetHeader>

        <ScrollArea scrollFade className="min-h-0 flex-1">
          <div className="grid gap-4 p-4">
            <div className="grid gap-1.5">
              <label className="text-xs font-medium" htmlFor="add-version-select">
                {t("versions.add.gameVersion")}
              </label>

              {isPending && !gameVersions ? (
                <Skeleton className="h-8 w-full" />
              ) : selectableVersions.length === 0 ? (
                <p className="text-muted-foreground text-xs">
                  {t("versions.add.allInstalledOrDownloading")}
                </p>
              ) : (
                <Select
                  items={availableVersions.map((v) => ({
                    label: installedSet.has(v)
                      ? t("versions.add.installedOption", { version: v })
                      : v,
                    value: v,
                  }))}
                  value={version}
                  onValueChange={(value) => value && setPicked(value)}
                >
                  <SelectTrigger className="w-full" id="add-version-select">
                    <SelectValue placeholder={t("versions.add.pickPlaceholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    {availableVersions.map((v) => (
                      <SelectItem key={v} value={v} disabled={installedSet.has(v)}>
                        <span className="font-mono">{v}</span>
                        {installedSet.has(v) && (
                          <span className="text-muted-foreground ml-2 text-xs">
                            {t("versions.add.installedTag")}
                          </span>
                        )}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {macWarning && (
              <Alert variant="destructive">
                <TriangleAlert />
                <AlertTitle>{t("versions.add.macWarningTitle")}</AlertTitle>
                <AlertDescription>
                  <Trans
                    i18nKey="versions.add.macWarning"
                    components={{
                      wiki: (
                        <a
                          className="hover:text-foreground underline underline-offset-2"
                          href={MAC_WIKI_URL}
                          rel="noreferrer"
                          target="_blank"
                          onClick={(event) => {
                            event.preventDefault();
                            void openUrl(MAC_WIKI_URL);
                          }}
                        />
                      ),
                    }}
                  />
                </AlertDescription>
              </Alert>
            )}
          </div>
        </ScrollArea>

        <SheetFooter className="border-t">
          <div className="flex items-center gap-2">
            <Button variant="outline" className="flex-1" onClick={() => handleOpenChange(false)}>
              {t("common.actions.cancel")}
            </Button>
            <Button
              variant="accent-primary"
              className="flex-1"
              disabled={
                !version || installedSet.has(version) || busyVersions.has(version) || isPending
              }
              onClick={submit}
            >
              {t("versions.add.action")}
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
