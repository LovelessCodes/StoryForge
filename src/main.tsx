import { QueryClientProvider } from "@tanstack/react-query";
import { createHashHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import { invoke } from "@tauri-apps/api/core";
import { ThemeProvider } from "next-themes";
import React from "react";
import ReactDOM from "react-dom/client";

import RoutePending from "./components/common/RoutePending";
import { ensureDefaultProfile } from "./lib/ensure-default-profile";
import { queryClient } from "./lib/query-client";
import { routeTree } from "./routeTree.gen";
import { useAccountStore } from "./stores/accounts";
import { useProfilesStore } from "./stores/profiles";
import { useServerStore } from "./stores/servers";
import { tauriSettingsHandler } from "./stores/settings";

import "./styles.css";

const router = createRouter({
  routeTree,
  history: createHashHistory(),
  context: { queryClient },
  defaultPreload: "intent",
  defaultPreloadStaleTime: 0,
  defaultPendingComponent: RoutePending,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

/**
 * Boot sequence: start the persisted settings store, then load the profile,
 * server and account stores off disk so the first paint already has them.
 */
async function bootstrap() {
  try {
    await invoke("log_webview_gap").catch(() => {});
    await tauriSettingsHandler.start();
    await Promise.all([
      useServerStore.getState().loadServers(),
      useProfilesStore.getState().loadProfiles(),
      useAccountStore.getState().loadAccounts(),
    ]);
    await ensureDefaultProfile();
  } catch (error) {
    console.error("startup failed:", error);
  }
}

async function main() {
  await bootstrap();
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <ThemeProvider
        attribute="class"
        defaultTheme="dark"
        enableSystem={false}
        disableTransitionOnChange
      >
        <QueryClientProvider client={queryClient}>
          <RouterProvider router={router} />
        </QueryClientProvider>
      </ThemeProvider>
    </React.StrictMode>,
  );
  await invoke("log_startup_time").catch(() => {});
}

void main();
