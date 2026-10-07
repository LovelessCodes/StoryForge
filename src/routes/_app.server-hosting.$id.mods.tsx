import { createFileRoute } from "@tanstack/react-router";

import HostingModsPage from "@/components/hosting/HostingModsPage";

export const Route = createFileRoute("/_app/server-hosting/$id/mods")({
  component: HostingModsPage,
});
