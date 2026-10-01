import { openUrl } from "@tauri-apps/plugin-opener";
import { FolderDown, Plus } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useInstalledVersions } from "@/hooks/use-installed-versions";
import { compareSemverDesc, isMac } from "@/lib/helpers";
import { useDownloadStore } from "@/stores/downloads";

import AddVersionSheet, { MAC_WIKI_URL } from "./AddVersionSheet";
import DownloadRow from "./DownloadRow";
import VersionRow from "./VersionRow";

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
  const { data: versions, isPending } = useInstalledVersions();
  const entries = useDownloadStore((s) => s.entries);
  const [addOpen, setAddOpen] = useState(false);

  const sorted = (versions ?? []).toSorted((a, b) => compareSemverDesc(a.name, b.name));
  const activeDownloads = Object.values(entries).filter((entry) => entry.status !== "done");

  return (
    <div className="grid gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold">Versions</h1>
          <p className="text-muted-foreground text-xs">
            Game builds installed on this machine. Profiles launch with one of these versions.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="accent-primary" size="sm" onClick={() => setAddOpen(true)}>
            <Plus />
            Add version
          </Button>
        </div>
      </div>

      {activeDownloads.length > 0 && (
        <section className="grid gap-2">
          <h2 className="text-muted-foreground text-[10px] font-medium tracking-widest uppercase">
            Active downloads ({activeDownloads.length})
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
          Installed versions{sorted.length > 0 ? ` (${sorted.length})` : ""}
        </h2>

        {isPending && sorted.length === 0 ? (
          <InstalledVersionsSkeleton />
        ) : sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 border border-dashed p-10 text-center">
            <FolderDown className="text-muted-foreground size-6" />
            <div className="grid gap-1">
              <p className="text-muted-foreground text-xs">No game versions installed yet.</p>
              <p className="text-muted-foreground text-[11px]">
                Download a build to create profiles and launch the game.
              </p>
            </div>
            <Button size="sm" variant="accent-primary" onClick={() => setAddOpen(true)}>
              <Plus />
              Add version
            </Button>
            {isMac && (
              <p className="text-muted-foreground max-w-md text-[11px]">
                On macOS, versions below 1.19.0 need extra setup to run. See the{" "}
                <a
                  className="hover:text-foreground underline underline-offset-2"
                  href={MAC_WIKI_URL}
                  rel="noreferrer"
                  target="_blank"
                  onClick={(event) => {
                    event.preventDefault();
                    void openUrl(MAC_WIKI_URL);
                  }}
                >
                  Installing Vintage Story on macOS
                </a>{" "}
                wiki article.
              </p>
            )}
          </div>
        ) : (
          <div className="grid gap-2">
            {sorted.map((version) => (
              <VersionRow key={version.name} version={version} />
            ))}
          </div>
        )}
      </section>

      <AddVersionSheet open={addOpen} onOpenChange={setAddOpen} />
    </div>
  );
}
