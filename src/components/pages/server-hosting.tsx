import { listen } from "@tauri-apps/api/event";
import { HardDriveIcon, PlusIcon } from "lucide-react";
import { AnimatePresence } from "motion/react";
import { useEffect, useRef } from "react";
import { toast } from "sonner";

import { CreateHostedServerDialog } from "@/components/dialogs/create-hosted-server.dialog";
import { ServerInstanceRow } from "@/components/rows/server-instance.row";
import { Button } from "@/components/ui/button";
import { DialogTrigger } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { rootDialogHandle } from "@/handles";
import { useMountEffect } from "@/hooks/use-mount-effect";
import { useServerHostingStore, type ServerRuntimeStatus } from "@/stores/server-hosting";

export function ServerHostingPage() {
  const { instances, loading, loadInstances } = useServerHostingStore();
  const listenedIds = useRef(new Set<number>());

  useMountEffect(() => {
    void loadInstances();
  });

  // Listen for live status updates
  useEffect(() => {
    const unlistenFns: (() => void)[] = [];
    let cancelled = false;

    for (const inst of instances) {
      if (listenedIds.current.has(inst.id)) continue;
      listenedIds.current.add(inst.id);

      const eventName = `server-status:${inst.id}`;
      void (async () => {
        try {
          const unlisten = await listen<{
            status: string;
            pid?: number;
            uptime?: number;
            exit_code?: number;
          }>(eventName, (event) => {
            if (cancelled) return;
            useServerHostingStore.getState().updateRuntimeStatus(inst.id, {
              status: event.payload.status as ServerRuntimeStatus["status"],
              pid: event.payload.pid ?? null,
              uptime: event.payload.uptime ?? null,
              exit_code: event.payload.exit_code ?? null,
            });
          });
          if (!cancelled) {
            unlistenFns.push(unlisten);
          } else {
            unlisten();
          }
        } catch {
          // ignore listener setup errors
        }
      })();
    }

    return () => {
      cancelled = true;
      for (const fn of unlistenFns) fn();
    };
  }, [instances]);

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
                    void loadInstances();
                    toast.success("Server instance created");
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
          disabled={loading}
          onClick={() => void loadInstances()}
          size="icon"
          variant="outline"
        >
          <HardDriveIcon aria-hidden="true" size={16} />
        </Button>
      </div>
      <ScrollArea className="h-full px-2" scrollFade>
        <AnimatePresence>
          {instances.length > 0 ? (
            instances.map((instance, index) => (
              <ServerInstanceRow
                className="not-last:border-b"
                index={index}
                instance={instance}
                key={instance.id}
              />
            ))
          ) : loading ? (
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
