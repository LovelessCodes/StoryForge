import { FileDownIcon, FolderPlusIcon } from "lucide-react";
import { AnimatePresence } from "motion/react";

import { MotionInstallationContextMenu } from "@/components/context-menus/installation.context-menu";
import { ImportInstallationDialog } from "@/components/dialogs/importinstallation.dialog";
import { InstallationDialog } from "@/components/dialogs/installation.dialog";
import { InstallationRow } from "@/components/rows/installation.row";
import { Button } from "@/components/ui/button";
import { DialogTrigger } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { TooltipTrigger } from "@/components/ui/tooltip";
import { rootDialogHandle, rootTooltipHandle } from "@/handles";
import { itemVariants, sortInstallations } from "@/lib/utils";
import { useInstallations } from "@/stores/installations";

export function InstallationsPage() {
  // Stores
  const { installations } = useInstallations();

  return (
    <div className="grid size-full grid-rows-[min-content_auto] gap-2">
      <div className="grid h-fit grid-cols-[auto_min-content] gap-2 pt-1 pr-2 pl-2 max-md:pl-9">
        <Button
          className="w-full cursor-pointer justify-between"
          render={
            <DialogTrigger handle={rootDialogHandle} payload={() => <InstallationDialog />} />
          }
          variant="outline"
        >
          <span className="flex text-xs">Add installation</span>
          <FolderPlusIcon className="size-4" />
        </Button>
        <TooltipTrigger
          render={
            <Button
              aria-label="Import installation"
              className="shadow-none focus-visible:z-10"
              render={
                <DialogTrigger
                  handle={rootDialogHandle}
                  payload={() => <ImportInstallationDialog />}
                />
              }
              size="icon"
              variant="outline"
            />
          }
          handle={rootTooltipHandle}
          payload={() => "Import Installation"}
        >
          <FileDownIcon aria-hidden="true" size={16} />
        </TooltipTrigger>
      </div>
      <ScrollArea className="h-full px-2" scrollFade>
        <AnimatePresence>
          {installations.sort(sortInstallations).map((installation, index) => (
            <MotionInstallationContextMenu
              animate="show"
              className="flex items-center gap-2 p-2 not-last:border-b"
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
      </ScrollArea>
    </div>
  );
}
