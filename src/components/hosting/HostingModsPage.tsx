import { Link, useParams } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

import { ListSkeleton } from "@/components/common/LoadingSkeleton";
import ModsPage from "@/components/mods/ModsPage";
import { Button } from "@/components/ui/button";
import { useHostedServer, useHostedServers } from "@/hooks/queries/server-hosting";

export default function HostingModsPage() {
  const { id } = useParams({ from: "/_app/server-hosting/$id/mods" });
  const instanceId = Number(id);
  const { isPending } = useHostedServers();
  const instance = useHostedServer(instanceId);

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="flex items-center gap-3">
        <Button
          aria-label="Back to the instance"
          render={<Link params={{ id: String(id) }} to="/server-hosting/$id" />}
          size="icon-sm"
          variant="ghost"
        >
          <ArrowLeft />
        </Button>
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold">
            {instance ? `${instance.name} — Mods` : "Server mods"}
          </h1>
          <p className="text-muted-foreground text-xs">
            Install and manage mods in this server&apos;s data folder.
          </p>
        </div>
      </div>

      {instance ? (
        <ModsPage targetLabel={instance.name} targetPath={instance.data_dir} />
      ) : isPending ? (
        <ListSkeleton rows={5} />
      ) : (
        <p className="text-muted-foreground text-sm">Instance not found.</p>
      )}
    </div>
  );
}
