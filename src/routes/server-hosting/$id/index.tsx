import { createFileRoute } from "@tanstack/react-router";

import { ServerHostingDetailPage } from "@/components/pages/server-hosting-detail";
import { ErrorComponent } from "@/components/ui/error";

export const Route = createFileRoute("/server-hosting/$id/")({
  component: ServerHostingDetailPage,
  errorComponent: ErrorComponent,
});
