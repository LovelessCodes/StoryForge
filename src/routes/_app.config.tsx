import { createFileRoute } from "@tanstack/react-router";

import ConfigPage from "@/components/config/ConfigPage";

export const Route = createFileRoute("/_app/config")({
  component: ConfigPage,
});
