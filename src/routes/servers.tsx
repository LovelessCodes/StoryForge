import { createFileRoute } from "@tanstack/react-router";

import { ServersPage } from "@/components/pages/servers";
import { ErrorComponent } from "@/components/ui/error";

export const Route = createFileRoute("/servers")({
  component: ServersPage,
  errorComponent: ErrorComponent,
});
