import { createFileRoute } from "@tanstack/react-router";

import { ModBrowser } from "@/components/pages/mods-browser";

export const Route = createFileRoute("/mods")({
  component: () => <ModBrowser modsDirectory={undefined} />,
});
