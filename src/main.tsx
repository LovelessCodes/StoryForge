import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import ReactDOM from "react-dom/client";

import { SidebarProvider } from "./components/ui/sidebar";
import { routeTree } from "./routeTree.gen";
import { useAccountStore } from "./stores/accounts";
import { useInstallationsStore } from "./stores/installations";
import { useServerStore } from "./stores/servers";
import { tauriSettingsHandler } from "./stores/settings";

await tauriSettingsHandler.start();
const dark = tauriSettingsHandler.store.getState().darkMode;
if (dark) {
  document.body.classList.add("dark");
} else {
  document.body.classList.remove("dark");
}

useServerStore.getState().loadServers();
useAccountStore.getState().loadAccounts();
useInstallationsStore.getState().loadInstallations();

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
    </QueryClientProvider>
  </SidebarProvider>,
);
