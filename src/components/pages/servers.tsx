import { MapPinPlusIcon } from "lucide-react";
import { AnimatePresence } from "motion/react";

import { MotionServerContextMenu } from "@/components/context-menus/server.context-menu";
import { ServerDialog } from "@/components/dialogs/server.dialog";
import { ServerRow } from "@/components/rows/server.row";
import { Button } from "@/components/ui/button";
import { DialogTrigger } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { rootDialogHandle } from "@/handles";
import { itemVariants } from "@/lib/utils";
import { useServerStore } from "@/stores/servers";

export function ServersPage() {
  // Stores
  const { servers } = useServerStore();

  return (
    <div className="grid size-full grid-rows-[min-content_auto]">
      <div className="flex h-fit pt-1 pr-2 pl-2 max-md:pl-9">
        <Button
          className="w-full cursor-pointer justify-between"
          render={<DialogTrigger handle={rootDialogHandle} payload={() => <ServerDialog />} />}
          variant="outline"
        >
          <span className="flex text-xs">Add server</span>
          <MapPinPlusIcon className="size-4" />
        </Button>
      </div>
      <ScrollArea className="h-full px-2" scrollFade>
        <AnimatePresence>
          {servers
            .sort((a, b) => {
              if (a.favorite === b.favorite) return a.index - b.index;
              return a.favorite ? -1 : 1;
            })
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
      </ScrollArea>
    </div>
  );
}
