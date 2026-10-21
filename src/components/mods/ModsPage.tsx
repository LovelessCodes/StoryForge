import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useActiveProfile } from "@/hooks/use-active-profile";
import { errorMessage } from "@/lib/errors";
import { baseGameVersion, pathBasename } from "@/lib/helpers";
import { toast } from "@/lib/notify";
import type { Mod, ModInfo } from "@/lib/types";
import { useSettingsStore } from "@/stores/settings";

import { InstalledModsView } from "./InstalledModsView";
import { ModsBrowseView } from "./ModsBrowseView";
import { ModSheetHost, type SheetRequest } from "./ModSheetHost";
import { useModFilters, useModsData } from "./use-mods-data";

export type ModsPageProps = {
  /**
   * Profile root to manage instead of the active profile (e.g. a hosted
   * server's data dir). Installing/updating/removing then targets this path.
   */
  targetPath?: string;
  /** Human label for the target shown where the folder basename used to be. */
  targetLabel?: string;
  /** Pinned game version of the target, used when exporting a modpack. */
  targetVersion?: string;
  /**
   * What the target is. Server data dirs run every installed mod, so the
   * enable/disable controls only make sense for profiles.
   */
  targetKind?: "profile" | "server";
};

export default function ModsPage({
  targetPath,
  targetLabel,
  targetVersion,
  targetKind,
}: ModsPageProps) {
  const { t } = useTranslation();
  const { activeProfile } = useActiveProfile();
  const defaultModSortBy = useSettingsStore((s) => s.defaultModSortBy);
  const filters = useModFilters(defaultModSortBy);

  // The profile root (not the Mods subdir) is what the installed-mods and
  // update commands expect.
  const profilePath = targetPath ?? activeProfile?.path;
  const destinationLabel =
    targetLabel ??
    (targetPath ? pathBasename(targetPath) : (activeProfile?.name ?? t("mods.standalone")));
  const gameVersion = baseGameVersion(targetVersion ?? activeProfile?.version ?? "");
  const canToggleMods = targetKind !== "server";

  const data = useModsData({
    author: filters.author,
    category: filters.category,
    favoritesOnly: filters.favoritesOnly,
    modsDirectory: profilePath,
    orderDirection: filters.orderDirection,
    profileGameVersion: gameVersion,
    searchText: filters.appliedSearchText,
    selectedGameVersions: filters.selectedGameVersions,
    selectedModTags: filters.selectedModTags,
    side: filters.side,
    sortBy: filters.sortBy,
  });

  const [view, setView] = useState<"browse" | "installed">("browse");
  const [sheet, setSheet] = useState<SheetRequest | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [blockedOpen, setBlockedOpen] = useState(false);

  const openSheet = (request: SheetRequest) => {
    setSheet(request);
    setSheetOpen(true);
  };

  // A deep link (`storyforge://install?mod=…`, or ModDB's 1-click
  // `vintagestorymodinstall://<id>@<version>` button) queued a mod id and
  // optionally a release; open the install sheet for it once this page is
  // mounted. With the "always ask" preference the standalone picker opens
  // even when an active profile exists, preselecting that profile.
  const pendingDeepLinkMod = useSettingsStore((s) => s.pendingDeepLinkMod);
  const pendingDeepLinkModVersion = useSettingsStore((s) => s.pendingDeepLinkModVersion);
  const promptModInstallDestination = useSettingsStore((s) => s.promptModInstallDestination);
  const setPendingDeepLinkMod = useSettingsStore((s) => s.setPendingDeepLinkMod);
  const setPendingDeepLinkModVersion = useSettingsStore((s) => s.setPendingDeepLinkModVersion);
  useEffect(() => {
    const modid = pendingDeepLinkMod;
    if (!modid) return;
    const version = pendingDeepLinkModVersion ?? undefined;
    setPendingDeepLinkMod(null);
    setPendingDeepLinkModVersion(null);
    void (async () => {
      try {
        const info = await invoke<ModInfo>("fetch_mod_info", { modid });
        const mod: Mod = {
          assetid: info.mod.assetid,
          author: info.mod.author,
          comments: info.mod.comments,
          downloads: info.mod.downloads,
          follows: info.mod.follows,
          lastreleased: info.mod.lastreleased,
          logo: info.mod.logofile,
          modid: info.mod.modid,
          modidstrs: [modid],
          name: info.mod.name,
          side: info.mod.side,
          summary: (info.mod.text ?? "").slice(0, 240),
          tags: info.mod.tags,
          trendingpoints: info.mod.trendingpoints,
          type: info.mod.type,
          urlalias: info.mod.urlalias ?? null,
        };
        if (version && !info.mod.releases.some((release) => release.modversion === version)) {
          toast.warning(t("mods.deepLink.versionUnavailable", { modid, version }));
        }
        if (promptModInstallDestination || !profilePath) {
          openSheet({
            kind: "standalone",
            mod,
            prompt: promptModInstallDestination,
            version,
          });
        } else {
          openSheet({ kind: "add", mod, version });
        }
      } catch (error) {
        toast.error(t("mods.deepLink.failed", { modid }), { description: errorMessage(error) });
      }
    })();
    // Consumed once per queued id/version; the sheet state is local to this
    // page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingDeepLinkMod, pendingDeepLinkModVersion]);

  return (
    <TooltipProvider>
      <div className="flex h-full min-h-0 flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <ToggleGroup
            aria-label={t("mods.view.aria")}
            size="sm"
            value={[view]}
            variant="outline"
            onValueChange={(value) => {
              if (value[0]) setView(value[0] as "browse" | "installed");
            }}
          >
            <ToggleGroupItem value="browse">{t("mods.view.browse")}</ToggleGroupItem>
            <ToggleGroupItem value="installed">
              {t("mods.view.installed", { count: data.instMods?.mods.length ?? 0 })}
            </ToggleGroupItem>
          </ToggleGroup>
        </div>

        {view === "browse" ? (
          <ModsBrowseView
            canToggleMods={canToggleMods}
            data={data}
            destinationLabel={destinationLabel}
            filters={filters}
            gameVersion={gameVersion}
            onBlockedOpen={() => setBlockedOpen(true)}
            onOpenSheet={openSheet}
            profilePath={profilePath}
          />
        ) : profilePath ? (
          <InstalledModsView
            canToggleMods={canToggleMods}
            gameVersion={gameVersion}
            modsDirectory={profilePath}
          />
        ) : (
          <p className="text-muted-foreground border border-dashed p-6 text-center text-xs">
            {t("mods.installed.noTarget")}
          </p>
        )}
      </div>

      <ModSheetHost
        activeProfile={activeProfile}
        blockedOpen={blockedOpen}
        destinationLabel={destinationLabel}
        modsDirectory={profilePath}
        onBlockedOpenChange={setBlockedOpen}
        onOpenChange={setSheetOpen}
        open={sheetOpen}
        sheet={sheet}
      />
    </TooltipProvider>
  );
}
