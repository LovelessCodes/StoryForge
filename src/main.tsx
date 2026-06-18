import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { invoke } from "@tauri-apps/api/core";
import { domAnimation, LazyMotion, MotionConfig } from "motion/react";
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

void invoke("log_webview_gap");

const frontendLoadStart = performance.now();

let settingsTime = 0,
  serversTime = 0,
  installationsTime = 0,
  accountsTime = 0;
await Promise.all([
  (async () => {
    const t = performance.now();
    await tauriSettingsHandler.start();
    settingsTime = performance.now() - t;
  })(),
  (async () => {
    const t = performance.now();
    await useServerStore.getState().loadServers();
    serversTime = performance.now() - t;
  })(),
  (async () => {
    const t = performance.now();
    await useInstallationsStore.getState().loadInstallations();
    installationsTime = performance.now() - t;
  })(),
  (async () => {
    const t = performance.now();
    await useAccountStore.getState().loadAccounts();
    accountsTime = performance.now() - t;
  })(),
]);
void invoke("log_message", {
  level: "INFO ",
  message: `Frontend store loading: ${(performance.now() - frontendLoadStart).toFixed(2)}ms (settings=${settingsTime.toFixed(2)}ms servers=${serversTime.toFixed(2)}ms installations=${installationsTime.toFixed(2)}ms accounts=${accountsTime.toFixed(2)}ms)`,
});

const dark = tauriSettingsHandler.store.getState().darkMode;
if (dark) {
  document.body.classList.add("dark");
} else {
  document.body.classList.remove("dark");
}

{
  const { users, removeUser } = useAccountStore.getState();
  for (const user of users) {
    if (!user.sessionkey || !user.uid) continue;
    invoke("verify", { sessionkey: user.sessionkey, uid: user.uid }).catch(async () => {
      removeUser(user.uid);
      toast.error(`${user.playername ?? user.email}'s session expired — please sign in again`);
      rootDialogHandle.openWithPayload(() => <AddUserDialog email={user.email} />);
    });
  }
}

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

const reactRenderStart = performance.now();
ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <MotionConfig reducedMotion="user">
    <LazyMotion features={domAnimation}>
      <SidebarProvider>
        <QueryClientProvider client={queryClient}>
          <RouterProvider router={router} />
        </QueryClientProvider>
      </SidebarProvider>
    </LazyMotion>
  </MotionConfig>,
);
void invoke("log_message", {
  level: "INFO ",
  message: `React render: ${(performance.now() - reactRenderStart).toFixed(2)}ms`,
});

void invoke("log_startup_time");
