import { AppSidebar } from "@/components/sidebars/app.sidebar";
import "../App.css";
import { TanStackDevtools } from "@tanstack/react-devtools";
import type { QueryClient } from "@tanstack/react-query";
import { ReactQueryDevtoolsPanel } from "@tanstack/react-query-devtools";
import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import * as React from "react";
import { SidebarTrigger } from "@/components/ui/sidebar";

export const Route = createRootRouteWithContext<{
	queryClient: QueryClient;
}>()({
	component: RootComponent,
});

function RootComponent() {
	return (
		<React.Fragment>
			<AppSidebar />
			<main className="flex flex-1">
				<SidebarTrigger className="md:hidden h-full items-start pt-2 border-r" />
				<Outlet />
			</main>
			<TanStackDevtools
				plugins={[
					{
						name: "Query",
						render: <ReactQueryDevtoolsPanel />,
					},
					{
						name: "Router",
						render: <TanStackRouterDevtoolsPanel />,
					},
				]}
			/>
		</React.Fragment>
	);
}
