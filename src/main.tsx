import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { getCurrentWindow } from "@tauri-apps/api/window";
import ReactDOM from "react-dom/client";
import { Toaster } from "sonner";
import { SidebarProvider } from "./components/ui/sidebar";
import { routeTree } from "./routeTree.gen";
import { tauriAccountsHandler } from "./stores/accounts";
import { tauriInstallationsHandler } from "./stores/installations";
import { tauriServersHandler } from "./stores/servers";

const theme = await getCurrentWindow().theme();
if (theme === "dark") {
	document.body.classList.add("dark");
} else {
	document.body.classList.remove("dark");
}

await tauriServersHandler.start();
await tauriAccountsHandler.start();
await tauriInstallationsHandler.start();

const queryClient = new QueryClient();
const router = createRouter({
	context: { queryClient },
	defaultPreload: "intent",
	defaultPreloadStaleTime: 0,
	routeTree,
	scrollRestoration: true,
});

declare module "@tanstack/react-router" {
	interface Register {
		router: typeof router;
	}
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
	<SidebarProvider>
		<QueryClientProvider client={queryClient}>
			<RouterProvider router={router} />
			<Toaster />
		</QueryClientProvider>
	</SidebarProvider>,
);
