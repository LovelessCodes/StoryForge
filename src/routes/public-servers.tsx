import { createFileRoute } from "@tanstack/react-router";

import { PublicServersPage } from "@/components/pages/public-servers";
import { ErrorComponent } from "@/components/ui/error";

export const Route = createFileRoute("/public-servers")({
  component: PublicServersPage,
  errorComponent: ErrorComponent,
});
