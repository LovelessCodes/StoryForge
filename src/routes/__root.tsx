import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";

import RouteError from "@/components/common/RouteError";
import RouteNotFound from "@/components/common/RouteNotFound";
import { Toaster } from "@/components/ui/toast";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: RootComponent,
  errorComponent: RouteError,
  notFoundComponent: RouteNotFound,
});

function RootComponent() {
  return (
    <>
      <Outlet />
      <Toaster />
    </>
  );
}
