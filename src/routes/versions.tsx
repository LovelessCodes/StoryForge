import { createFileRoute } from "@tanstack/react-router";

import { SettingsPage } from "@/components/pages/settings";
import { ErrorComponent } from "@/components/ui/error";

export const Route = createFileRoute("/versions")({
  component: SettingsPage,
  errorComponent: ErrorComponent,
});
