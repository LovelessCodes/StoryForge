import { createFileRoute } from "@tanstack/react-router";

import { WorldsPage } from "@/components/pages/worlds";
import { ErrorComponent } from "@/components/ui/error";

export const Route = createFileRoute("/worlds")({
  component: WorldsPage,
  errorComponent: ErrorComponent,
});
