import { useQueryClient } from "@tanstack/react-query";
import { HardDriveIcon, PlusIcon } from "lucide-react";
import { AnimatePresence } from "motion/react";

import { CreateHostedServerDialog } from "@/components/dialogs/create-hosted-server.dialog";
import { ServerInstanceRow } from "@/components/rows/server-instance.row";
import { Button } from "@/components/ui/button";
import { DialogTrigger } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { rootDialogHandle } from "@/handles";
import { hostedServersQueryKey, useHostedServers } from "@/hooks/queries/server-hosting";

export function ServerHostingPage() {
  const queryClient = useQueryClient();
  const { data: instances, isPending } = useHostedServers();

  return (
    <div className="grid size-full grid-rows-[min-content_auto] gap-2">
      <div className="grid h-fit grid-cols-[auto_min-content] gap-2 pt-1 pr-2 pl-2 max-md:pl-9">
        <Button
          className="w-full cursor-pointer justify-between"
          render={
            <DialogTrigger
              handle={rootDialogHandle}
              payload={() => (
                <CreateHostedServerDialog
                  onSuccess={() => {
                    void queryClient.invalidateQueries({ queryKey: hostedServersQueryKey() });
                  }}
                />
              )}
            />
          }
          variant="outline"
        >
          <span className="flex text-xs">New Server</span>
          <PlusIcon className="size-4" />
        </Button>
        <Button
          aria-label="Refresh"
          className="shadow-none focus-visible:z-10"
          disabled={isPending}
          onClick={() => queryClient.invalidateQueries({ queryKey: hostedServersQueryKey() })}
          size="icon"
          variant="outline"
        >
          <HardDriveIcon aria-hidden="true" size={16} />
        </Button>
      </div>
      <ScrollArea className="h-full px-2" scrollFade>
        <AnimatePresence>
          {instances && instances.length > 0 ? (
            instances.map((instance, index) => (
              <ServerInstanceRow
                className="not-last:border-b"
                index={index}
                instance={instance}
                key={instance.id}
              />
            ))
          ) : isPending ? (
            <p className="text-muted-foreground p-4 text-sm select-none">Loading instances…</p>
          ) : (
            <p className="text-muted-foreground p-4 text-sm select-none">
              No server instances yet. Click "New Instance" to get started.
            </p>
          )}
        </AnimatePresence>
      </ScrollArea>
    </div>
  );
}
