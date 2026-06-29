import { FolderPlusIcon } from "lucide-react";
import { AnimatePresence } from "motion/react";

import { MotionVersionContextMenu } from "@/components/context-menus/version.context-menu";
import { AddVersionDialog } from "@/components/dialogs/addversion.dialog";
import { DownloadRow } from "@/components/rows/download.row";
import { VersionRow } from "@/components/rows/version.row";
import { Button } from "@/components/ui/button";
import { DialogTrigger } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { rootDialogHandle } from "@/handles";
import { useInstalledVersions } from "@/hooks/use-installed-versions";
import { compareSemverDesc, itemVariants } from "@/lib/utils";
import { useDownloadStore } from "@/stores/downloads";

export function VersionsPage() {
  const { data: versions } = useInstalledVersions();
  const downloadEntries = useDownloadStore((s) => s.entries);

  const sorted = (versions ?? []).toSorted((a, b) => compareSemverDesc(a.name, b.name));
  const activeDownloads = Object.values(downloadEntries).filter((e) => e.status !== "done");
  const hasContent = sorted.length > 0 || activeDownloads.length > 0;

  return (
    <div className="grid size-full grid-rows-[min-content_auto] gap-2">
      <div className="flex h-fit gap-2 pt-1 pr-2 pl-2 max-md:pl-9">
        <Button
          className="w-full cursor-pointer justify-between"
          render={<DialogTrigger handle={rootDialogHandle} payload={() => <AddVersionDialog />} />}
          variant="outline"
        >
          <span className="flex text-xs">Add version</span>
          <FolderPlusIcon className="size-4" />
        </Button>
      </div>
      <ScrollArea className="h-full px-2">
        <AnimatePresence>
          {activeDownloads.map((entry) => (
            <div
              className="flex items-center gap-2 p-2 not-last:border-b"
              key={`download-${entry.token}`}
            >
              <DownloadRow entry={entry} />
            </div>
          ))}
          {sorted.map((version, index) => (
            <MotionVersionContextMenu
              animate="show"
              className="flex items-center gap-2 p-2 not-last:border-b"
              custom={index}
              exit="exit"
              initial="hidden"
              key={`${version.name}-context-menu`}
              layout="position"
              variants={itemVariants}
              version={version.name}
            >
              <VersionRow version={version} />
            </MotionVersionContextMenu>
          ))}
          {!hasContent && (
            <p className="text-muted-foreground p-4 text-sm select-none">
              No versions yet. Click "Add version" to get started.
            </p>
          )}
        </AnimatePresence>
      </ScrollArea>
    </div>
  );
}
