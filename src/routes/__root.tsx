import { AppSidebar } from "@/components/sidebars/app.sidebar";
import "../App.css";
import { TanStackDevtools } from "@tanstack/react-devtools";
import type { QueryClient } from "@tanstack/react-query";
import { ReactQueryDevtoolsPanel } from "@tanstack/react-query-devtools";
import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import { relaunch } from "@tauri-apps/plugin-process";
import * as React from "react";
import { toast } from "sonner";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useUpdater } from "@/hooks/use-updater";

export const Route = createRootRouteWithContext<{
	queryClient: QueryClient;
}>()({
	component: RootComponent,
});

function RootComponent() {
	const { data: update } = useUpdater();

	React.useEffect(() => {
		if (update) {
			let downloaded: number = 0;
			let contentLength: number | undefined = 0;
			toast("A new update is available!", {
				action: {
					label: "Install",
					onClick: () =>
						update.downloadAndInstall((event) => {
							switch (event.event) {
								case "Started":
									contentLength = event.data.contentLength;
									toast.info("Updating", {
										description: "Starting download...",
										id: "updater",
									});
									break;
								case "Progress":
									downloaded = event.data.chunkLength;
									toast.info("Updating", {
										description: `Downloaded ${downloaded} of ${contentLength} bytes`,
										id: "updater",
									});
									break;
								case "Finished":
									toast.success("Updated", {
										description: "The application will restart now.",
										id: "updater",
									});
									setTimeout(() => {
										relaunch();
									}, 2500);
									break;
							}
						}),
				},
				description: `Version ${update.version} is available.`,
				dismissible: true,
				duration: Number.POSITIVE_INFINITY,
				id: "updater",
			});
		}
	}, [update]);

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
