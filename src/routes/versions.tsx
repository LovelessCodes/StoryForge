import { createFileRoute } from "@tanstack/react-router";
import { FolderPlusIcon } from "lucide-react";
import { AnimatePresence } from "motion/react";

import { MotionVersionContextMenu } from "@/components/context-menus/version.context-menu";
import { VersionRow } from "@/components/rows/version.row";
import { Button } from "@/components/ui/button";
import { ErrorComponent } from "@/components/ui/error";
import { useInstalledVersions } from "@/hooks/use-installed-versions";
import { compareSemverDesc, itemVariants } from "@/lib/utils";
import { useDialogStore } from "@/stores/dialogs";

export const Route = createFileRoute("/versions")({
  component: RouteComponent,
  errorComponent: ErrorComponent,
});

function RouteComponent() {
  // Stores
  const { openDialog } = useDialogStore();

  // Queries
  const { data: versions } = useInstalledVersions();

  return (
    <div className="flex w-full flex-col gap-2">
      <div className="bg-background/10 sticky top-0 z-10 flex h-fit gap-2 px-4 py-2 backdrop-blur-md">
        <Button
          className="w-full cursor-pointer justify-between"
          onClick={() => openDialog("AddVersionDialog")}
          variant="outline"
        >
          <span className="flex text-xs">Add version</span>
          <FolderPlusIcon className="size-4" />
        </Button>
      </div>
      <div className="relative h-full w-full overflow-auto px-4">
        <div className="bg-card relative flex w-full flex-col overflow-y-auto rounded border p-2 shadow">
          <AnimatePresence>
            {versions.sort(compareSemverDesc).map((version, index) => (
              <MotionVersionContextMenu
                animate="show"
                className="flex items-center gap-2 px-2 py-2 not-last:border-b"
                custom={index}
                exit="exit"
                initial="hidden"
                key={`${version}-context-menu`}
                layout="position"
                variants={itemVariants}
                version={version}
              >
                <VersionRow version={version} />
              </MotionVersionContextMenu>
            ))}
            {versions.length === 0 && (
              <p className="text-muted-foreground p-4 text-sm select-none">
                No versions yet. Click "Add version" to get started.
              </p>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
