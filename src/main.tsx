import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { invoke } from "@tauri-apps/api/core";
import { MotionConfig } from "framer-motion";
import ReactDOM from "react-dom/client";
import { toast } from "sonner";

import { AddUserDialog } from "./components/dialogs/adduser.dialog";
import { SidebarProvider } from "./components/ui/sidebar";
import { rootDialogHandle } from "./handles";
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

await useServerStore.getState().loadServers();
await useInstallationsStore.getState().loadInstallations();

await useAccountStore
  .getState()
  .loadAccounts()
  .then(() => {
    const { users, removeUser } = useAccountStore.getState();
    for (const user of users) {
      if (!user.sessionkey || !user.uid) continue;
      invoke("verify", { sessionkey: user.sessionkey, uid: user.uid }).catch(async () => {
        removeUser(user.uid);
        toast.error(`${user.playername ?? user.email}'s session expired — please sign in again`);
        rootDialogHandle.openWithPayload(() => <AddUserDialog email={user.email} />);
      });
    }
  });

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
  <MotionConfig reducedMotion="user">
    <SidebarProvider>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </SidebarProvider>
  </MotionConfig>,
);
