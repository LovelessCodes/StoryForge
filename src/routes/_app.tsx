import { createFileRoute } from "@tanstack/react-router";

import MainLayout from "@/components/layout/MainLayout";

export const Route = createFileRoute("/_app")({
  component: MainLayout,
});
