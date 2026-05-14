import { createFileRoute } from "@tanstack/react-router";
import { FileDownIcon, FolderPlusIcon } from "lucide-react";
import { AnimatePresence } from "motion/react";

import { MotionInstallationContextMenu } from "@/components/context-menus/installation.context-menu";
import { InstallationRow } from "@/components/rows/installation.row";
import { Button } from "@/components/ui/button";
import { ErrorComponent } from "@/components/ui/error";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { itemVariants, sortInstallations } from "@/lib/utils";
import { useDialogStore } from "@/stores/dialogs";
import { useInstallations } from "@/stores/installations";

export const Route = createFileRoute("/installations")({
  component: RouteComponent,
  errorComponent: ErrorComponent,
});

function RouteComponent() {
  // Stores
  const { installations } = useInstallations();
  const { openDialog } = useDialogStore();

  return (
    <div className="flex w-full flex-col gap-2">
      <div className="bg-background/10 sticky top-0 z-10 grid h-fit grid-cols-[1fr_min-content] gap-2 px-4 py-2 backdrop-blur-md">
        <Button
          className="w-full cursor-pointer justify-between"
          onClick={() => openDialog("AddInstallationDialog")}
          variant="outline"
        >
          <span className="flex text-xs">Add installation</span>
          <FolderPlusIcon className="size-4" />
        </Button>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                aria-label="Import installation"
                className="shadow-none focus-visible:z-10"
                onClick={() => openDialog("ImportInstallationDialog")}
                size="icon"
                variant="outline"
              />
            }
          >
            <FileDownIcon aria-hidden="true" size={16} />
          </TooltipTrigger>
          <TooltipContent>Import Installation</TooltipContent>
        </Tooltip>
      </div>
      <div className="relative h-full w-full overflow-auto px-4">
        <div className="bg-card relative flex w-full flex-col overflow-hidden rounded border p-2 shadow">
          <AnimatePresence>
            {installations.sort(sortInstallations).map((installation, index) => (
              <MotionInstallationContextMenu
                animate="show"
                className="flex items-center gap-2 px-2 py-2 not-last:border-b"
                custom={index}
                exit="exit"
                initial="hidden"
                installation={installation}
                key={`${installation.id}-context-menu`}
                layout="position"
                transition={{
                  damping: 32,
                  delay: index * 0.05, // 50ms incremental stagger based on current index
                  stiffness: 420,
                  type: "spring" as const,
                }}
                variants={itemVariants}
              >
                <InstallationRow installation={installation} key={installation.id} />
              </MotionInstallationContextMenu>
            ))}
            {installations.length === 0 && (
              <p className="text-muted-foreground p-4 text-sm select-none">
                No installations yet. Click "Add installation" to get started.
              </p>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
