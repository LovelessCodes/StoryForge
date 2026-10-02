import { createFileRoute } from "@tanstack/react-router";

import ModsPage from "@/components/mods/ModsPage";

export const Route = createFileRoute("/_app/mods")({
  component: ModsPage,
});
