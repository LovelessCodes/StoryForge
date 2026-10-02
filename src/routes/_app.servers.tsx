import { createFileRoute } from "@tanstack/react-router";

import ServersPage from "@/components/servers/ServersPage";

export const Route = createFileRoute("/_app/servers")({
  component: ServersPage,
});
