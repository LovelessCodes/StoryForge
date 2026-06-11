import { createFileRoute } from "@tanstack/react-router";

import { InstallationsPage } from "@/components/pages/installations";
import { ErrorComponent } from "@/components/ui/error";

export const Route = createFileRoute("/installations/")({
  component: InstallationsPage,
  errorComponent: ErrorComponent,
});
