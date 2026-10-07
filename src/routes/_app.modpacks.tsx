import { createFileRoute } from "@tanstack/react-router";

import ModpacksPage from "@/components/modpacks/ModpacksPage";

export const Route = createFileRoute("/_app/modpacks")({
  component: ModpacksPage,
});
