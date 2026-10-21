import { openUrl } from "@tauri-apps/plugin-opener";
import { FolderDown, FolderSearch, Plus } from "lucide-react";
import { useState } from "react";
import { Trans, useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useInstalledVersions } from "@/hooks/use-installed-versions";
import {
  baseGameVersion,
  compareSemverDesc,
  isMac,
  isOptimumVersion,
  isVulkanStoryVersion,
} from "@/lib/helpers";
import { useDownloadStore } from "@/stores/downloads";

import AddVersionSheet from "./AddVersionSheet";
import DownloadRow from "./DownloadRow";
import LinkExistingVersionSheet from "./LinkExistingVersionSheet";
import LinkVersionsBanner from "./LinkVersionsBanner";
import { MAC_WIKI_URL } from "./MacVersionWarnings";
import { OptimumInstallSheet } from "./OptimumInstallSheet";
import VersionRow from "./VersionRow";
import { VulkanStoryInstallSheet } from "./VulkanStoryInstallSheet";

function InstalledVersionsSkeleton() {
  return (
    <div className="grid gap-2">
      {[0, 1, 2].map((index) => (
        <div key={index} className="bg-card flex items-center gap-3 border p-3">
          <Skeleton className="size-4 shrink-0" />
          <div className="grid flex-1 gap-1.5">
            <Skeleton className="h-3.5 w-28" />
            <Skeleton className="h-3 w-14" />
          </div>
          <Skeleton className="h-7 w-28" />
        </div>
      ))}
    </div>
  );
}

export default function VersionsPage() {
  const { t } = useTranslation();
  const { data: versions, isPending } = useInstalledVersions();
  const entries = useDownloadStore((s) => s.entries);
  const [addOpen, setAddOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [optimumBase, setOptimumBase] = useState<string | null>(null);
  const [vulkanStoryBase, setVulkanStoryBase] = useState<string | null>(null);

  // Client-fork builds sort next to their base version, vanilla first.
  const flavorRank = (name: string) =>
    isOptimumVersion(name) ? 1 : isVulkanStoryVersion(name) ? 2 : 0;
  const sorted = (versions ?? []).toSorted((a, b) => {
    const byBase = compareSemverDesc(baseGameVersion(a.name), baseGameVersion(b.name));
    if (byBase !== 0) return byBase;
    const byFlavor = flavorRank(a.name) - flavorRank(b.name);
    if (byFlavor !== 0) return byFlavor;
    return a.name.localeCompare(b.name);
  });
  const activeDownloads = Object.values(entries).filter((entry) => entry.status !== "done");

  return (
    <div className="grid gap-6">
      <div className="flex items-center justify-end gap-2">
        <Button variant="outline" size="sm" onClick={() => setLinkOpen(true)}>
          <FolderSearch />
          {t("versions.page.linkExisting")}
        </Button>
        <Button variant="accent-primary" size="sm" onClick={() => setAddOpen(true)}>
          <Plus />
          {t("versions.add.action")}
        </Button>
      </div>

      <LinkVersionsBanner />

      {activeDownloads.length > 0 && (
        <section className="grid gap-2">
          <h2 className="text-muted-foreground text-[10px] font-medium tracking-widest uppercase">
            {t("versions.page.activeDownloads", { count: activeDownloads.length })}
          </h2>
          <div className="grid gap-2">
            {activeDownloads.map((entry) => (
              <DownloadRow key={entry.token} entry={entry} />
            ))}
          </div>
        </section>
      )}

      <section className="grid gap-2">
        <h2 className="text-muted-foreground text-[10px] font-medium tracking-widest uppercase">
          {sorted.length > 0
            ? t("versions.page.installedVersionsCount", { count: sorted.length })
            : t("versions.page.installedVersions")}
        </h2>

        {isPending && sorted.length === 0 ? (
          <InstalledVersionsSkeleton />
        ) : sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 border border-dashed p-10 text-center">
            <FolderDown className="text-muted-foreground size-6" />
            <div className="grid gap-1">
              <p className="text-muted-foreground text-xs">{t("versions.page.emptyTitle")}</p>
              <p className="text-muted-foreground text-[11px]">
                {t("versions.page.emptyDescription")}
              </p>
            </div>
            <Button size="sm" variant="accent-primary" onClick={() => setAddOpen(true)}>
              <Plus />
              {t("versions.add.action")}
            </Button>
            {isMac && (
              <p className="text-muted-foreground max-w-md text-[11px]">
                <Trans
                  i18nKey="versions.page.macNote"
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
              </p>
            )}
          </div>
        ) : (
          <div className="grid gap-2">
            {sorted.map((version) => (
              <VersionRow
                key={version.name}
                version={version}
                onOptimum={setOptimumBase}
                onVulkanStory={setVulkanStoryBase}
              />
            ))}
          </div>
        )}
      </section>

      <AddVersionSheet open={addOpen} onOpenChange={setAddOpen} />
      <LinkExistingVersionSheet open={linkOpen} onOpenChange={setLinkOpen} />
      <OptimumInstallSheet
        baseVersion={optimumBase}
        open={!!optimumBase}
        onOpenChange={(open) => {
          if (!open) setOptimumBase(null);
        }}
      />
      <VulkanStoryInstallSheet
        baseVersion={vulkanStoryBase}
        open={!!vulkanStoryBase}
        onOpenChange={(open) => {
          if (!open) setVulkanStoryBase(null);
        }}
      />
    </div>
  );
}
