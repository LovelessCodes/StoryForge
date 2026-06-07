import { createFileRoute } from "@tanstack/react-router";

import { VersionsPage } from "@/components/pages/versions";
import { ErrorComponent } from "@/components/ui/error";

export const Route = createFileRoute("/versions")({
  component: VersionsPage,
  errorComponent: ErrorComponent,
});
