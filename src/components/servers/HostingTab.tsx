import { useIsFetching, useQueryClient } from "@tanstack/react-query";
import { HardDrive, Plus, RefreshCw, Server } from "lucide-react";
import { useState } from "react";

import { ListSkeleton } from "@/components/common/LoadingSkeleton";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { hostedServersQueryKey, useHostedServers } from "@/hooks/queries/server-hosting";

import CreateHostedServerSheet from "./CreateHostedServerSheet";
import HostedInstanceRow from "./HostedInstanceRow";

export default function HostingTab() {
  const queryClient = useQueryClient();
  const { data: instances, isPending } = useHostedServers();
  const [createOpen, setCreateOpen] = useState(false);
  const refreshing = useIsFetching({ queryKey: hostedServersQueryKey() }) > 0;

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="flex shrink-0 items-center justify-between gap-4">
        <p className="text-muted-foreground text-xs">
          Self-hosted Vintage Story instances managed by Story Forge.
        </p>
        <div className="flex items-center gap-2">
          <Button
            aria-label="Refresh instances"
            disabled={refreshing}
            size="icon-sm"
            variant="outline"
            onClick={() =>
              void queryClient.invalidateQueries({ queryKey: hostedServersQueryKey() })
            }
          >
            <RefreshCw className={refreshing ? "animate-spin" : undefined} />
          </Button>
          <Button size="sm" variant="accent-primary" onClick={() => setCreateOpen(true)}>
            <Plus /> New server
          </Button>
        </div>
      </div>

      <ScrollArea scrollFade className="min-h-0 flex-1">
        {isPending && !instances ? (
          <ListSkeleton rows={3} />
        ) : (instances ?? []).length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 border border-dashed p-10 text-center">
            <Server className="text-muted-foreground size-6" />
            <div>
              <p className="text-sm font-medium">No server instances yet</p>
              <p className="text-muted-foreground text-xs">
                Create an instance to run a dedicated Vintage Story server from this machine.
              </p>
            </div>
            <Button size="sm" variant="accent-primary" onClick={() => setCreateOpen(true)}>
              <HardDrive /> Create your first instance
            </Button>
          </div>
        ) : (
          <div className="divide-y border">
            {(instances ?? []).map((instance) => (
              <HostedInstanceRow instance={instance} key={instance.id} />
            ))}
          </div>
        )}
      </ScrollArea>

      <CreateHostedServerSheet open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
