import { createFileRoute } from "@tanstack/react-router";

import HostingDetailPage from "@/components/hosting/HostingDetailPage";

export const Route = createFileRoute("/_app/server-hosting/$id")({
  component: HostingDetailPage,
});
