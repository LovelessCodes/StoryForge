import { createFileRoute } from "@tanstack/react-router";

import { ModpacksPage } from "@/components/pages/modpacks";
import { ErrorComponent } from "@/components/ui/error";

export const Route = createFileRoute("/modpacks")({
  component: ModpacksPage,
  errorComponent: ErrorComponent,
});
