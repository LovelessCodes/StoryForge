import { createFileRoute } from "@tanstack/react-router";

import { DashboardPage } from "@/components/pages/dashboard";
import { ErrorComponent } from "@/components/ui/error";

export const Route = createFileRoute("/")({
  component: DashboardPage,
  errorComponent: ErrorComponent,
});
