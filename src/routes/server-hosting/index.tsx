import { createFileRoute } from "@tanstack/react-router";

import { ServerHostingPage } from "@/components/pages/server-hosting";
import { ErrorComponent } from "@/components/ui/error";

export const Route = createFileRoute("/server-hosting/")({
  component: ServerHostingPage,
  errorComponent: ErrorComponent,
});
