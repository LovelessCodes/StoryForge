import { createFileRoute } from "@tanstack/react-router";

import { ModConfigsPage } from "@/components/pages/mod-configs";
import { ErrorComponent } from "@/components/ui/error";

export const Route = createFileRoute("/mod-configs/$id")({
  component: ModConfigsPage,
  errorComponent: ErrorComponent,
});
