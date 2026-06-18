import { useParams, useRouter } from "@tanstack/react-router";
import { createFileRoute } from "@tanstack/react-router";
import { ArrowLeftIcon } from "lucide-react";

import { ModBrowser } from "@/components/pages/mods-browser";
import { Button } from "@/components/ui/button";
import { ErrorComponent } from "@/components/ui/error";
import { useHostedServer } from "@/hooks/queries/server-hosting";

export const Route = createFileRoute("/server-hosting/$id/mods")({
  component: ServerHostingModsPage,
  errorComponent: ErrorComponent,
});

function ServerHostingModsPage() {
  const { id } = useParams({ from: "/server-hosting/$id/mods" });
  const router = useRouter();
  const instanceId = Number(id);

  const instance = useHostedServer(instanceId);

  if (!instance) {
    return (
      <div className="flex flex-col items-center gap-4 py-12">
        <p className="text-muted-foreground text-sm">Instance not found.</p>
        <Button
          onClick={() => void router.navigate({ to: "/server-hosting" })}
          variant="outline"
          size="sm"
        >
          Back to Server Hosting
        </Button>
      </div>
    );
  }

  return (
    <div className="relative flex size-full flex-col">
      {/* Back navigation */}
      <div className="absolute top-2 left-2 z-10">
        <Button
          onClick={() =>
            void router.navigate({
              to: "/server-hosting/$id",
              params: { id: id },
            })
          }
          size="icon-sm"
          variant="ghost"
        >
          <ArrowLeftIcon className="size-4" />
        </Button>
      </div>
      <ModBrowser modsDirectory={instance.data_dir} />
    </div>
  );
}
