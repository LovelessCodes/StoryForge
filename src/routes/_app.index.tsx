import { createFileRoute } from "@tanstack/react-router";

import DashboardPage from "@/components/dashboard/DashboardPage";

export const Route = createFileRoute("/_app/")({
  component: DashboardPage,
});
