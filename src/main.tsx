import { QueryClientProvider } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createHashHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import { invoke } from "@tauri-apps/api/core";
import { locale } from "@tauri-apps/plugin-os";
import { ThemeProvider } from "next-themes";
import React from "react";
import ReactDOM from "react-dom/client";

import RoutePending from "./components/common/RoutePending";
import { ensureDefaultProfile } from "./lib/ensure-default-profile";
import { i18n, resolveLocale } from "./lib/i18n";
import { queryClient } from "./lib/query-client";
import { QUERY_CACHE_MAX_AGE, queryCachePersister, shouldPersistQuery } from "./lib/query-persist";
import { routeTree } from "./routeTree.gen";
import { useAccountStore } from "./stores/accounts";
import { useProfilesStore } from "./stores/profiles";
import { useServerStore } from "./stores/servers";
import { tauriSettingsHandler, useSettingsStore } from "./stores/settings";

import "./styles.css";

/** Restored on start and revalidated in the background; null when IndexedDB is unavailable. */
const persistOptions = queryCachePersister
  ? {
      buster: __APP_VERSION__,
      dehydrateOptions: {
        // Never resume mutations after a restart — replaying an install or
        // delete the user already initiated would duplicate side effects.
        shouldDehydrateMutation: () => false,
        shouldDehydrateQuery: shouldPersistQuery,
      },
      maxAge: QUERY_CACHE_MAX_AGE,
      persister: queryCachePersister,
    }
  : null;

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

    // Resolve the UI language before the first paint so the app never flashes
    // English for non-English users.
    let systemLocale: string | null = null;
    try {
      systemLocale = await locale();
    } catch {
      // Browser dev without the OS plugin: `navigator.language` is the fallback.
    }
    await i18n.changeLanguage(resolveLocale(useSettingsStore.getState().language, systemLocale));

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
        {persistOptions ? (
          <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
            <RouterProvider router={router} />
          </PersistQueryClientProvider>
        ) : (
          <QueryClientProvider client={queryClient}>
            <RouterProvider router={router} />
          </QueryClientProvider>
        )}
      </ThemeProvider>
    </React.StrictMode>,
  );
  await invoke("log_startup_time").catch(() => {});
}

void main();
