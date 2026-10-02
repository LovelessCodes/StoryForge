import { createFileRoute } from "@tanstack/react-router";

import WorldsPage from "@/components/worlds/WorldsPage";

export const Route = createFileRoute("/_app/worlds")({
  component: WorldsPage,
});
