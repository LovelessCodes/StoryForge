import { createFileRoute } from "@tanstack/react-router";
import { MapPinPlusIcon } from "lucide-react";
import { AnimatePresence } from "motion/react";

import { MotionServerContextMenu } from "@/components/context-menus/server.context-menu";
import { ServerRow } from "@/components/rows/server.row";
import { Button } from "@/components/ui/button";
import { ErrorComponent } from "@/components/ui/error";
import { itemVariants } from "@/lib/utils";
import { useDialogStore } from "@/stores/dialogs";
import { useServerStore } from "@/stores/servers";

export const Route = createFileRoute("/servers")({
  component: RouteComponent,
  errorComponent: ErrorComponent,
});

function RouteComponent() {
  // Stores
  const { servers } = useServerStore();
  const { openDialog } = useDialogStore();

  return (
    <div className="grid w-full grid-rows-[min-content_1fr] gap-2" style={{ height: "100vh" }}>
      <div className="flex w-full flex-col justify-start gap-2">
        <div className="bg-background/10 sticky top-0 z-10 flex h-fit gap-2 px-4 py-2 backdrop-blur-md">
          <Button
            className="w-full cursor-pointer justify-between"
            onClick={() => openDialog("AddServerDialog")}
            variant="outline"
          >
            <span className="flex text-xs">Add server</span>
            <MapPinPlusIcon className="size-4" />
          </Button>
        </div>
        <div className="relative h-full w-full overflow-auto px-4">
          <div className="bg-card relative flex w-full flex-col overflow-y-auto rounded border p-2 shadow">
            <AnimatePresence>
              {servers
                .sort((a, b) => a.index - b.index)
                .map((server, index) => (
                  <MotionServerContextMenu
                    animate="show"
                    className="not-last:border-b"
                    custom={index}
                    exit="exit"
                    initial="hidden"
                    key={`${server.id}-context-menu`}
                    layout="position"
                    server={server}
                    variants={itemVariants}
                  >
                    <ServerRow server={server} />
                  </MotionServerContextMenu>
                ))}
              {servers.length === 0 && (
                <p className="text-muted-foreground p-4 text-sm select-none">
                  No servers yet. Click "Add server" to get started.
                </p>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}
