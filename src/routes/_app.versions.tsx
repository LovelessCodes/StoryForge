import { createFileRoute } from "@tanstack/react-router";

import VersionsPage from "@/components/versions/VersionsPage";

export const Route = createFileRoute("/_app/versions")({
  component: VersionsPage,
});
