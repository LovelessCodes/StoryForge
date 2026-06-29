import { Outlet } from "@tanstack/react-router";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { platform } from "@tauri-apps/plugin-os";
import { relaunch } from "@tauri-apps/plugin-process";
import * as React from "react";
import { Toaster, toast } from "sonner";

import { MaximizeIcon } from "@/components/icons/maximize";
import { MinimizeIcon } from "@/components/icons/minimize";
import { XIcon } from "@/components/icons/x";
import { RootComponents } from "@/components/root-components";
import { AppSidebar } from "@/components/sidebars/app.sidebar";
import { Button } from "@/components/ui/button";
import { Sidebar, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { useServerStatusListener } from "@/hooks/queries/server-hosting";
import { useDownloadManager } from "@/hooks/use-download-manager";
import { useUpdater } from "@/hooks/use-updater";
import { cn } from "@/lib/utils";
import { useSettingsStore } from "@/stores/settings";

export function RootComponent() {
  // Stores
  const { darkMode } = useSettingsStore();

  // Queries
  const { data: update } = useUpdater();

  // Server hosting live status listener
  useServerStatusListener();

  // Download manager — lives at root for event listeners + queue processing + startup scan
  useDownloadManager();

  const relaunchTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);

  // Effects
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
                  relaunchTimeoutRef.current = setTimeout(() => {
                    void relaunch();
                  }, 2500);
                  break;
              }
            }),
        },
        cancel: {
          label: "Not now",
          onClick: () => toast.dismiss("update-available"),
        },
        description: `Version ${update.version} is available.`,
        dismissible: true,
        duration: Number.POSITIVE_INFINITY,
        id: "update-available",
      });
    }
    return () => {
      if (relaunchTimeoutRef.current) {
        clearTimeout(relaunchTimeoutRef.current);
        relaunchTimeoutRef.current = null;
      }
    };
  }, [update]);

  return (
    <React.Fragment>
      <Sidebar variant="inset" collapsible="icon">
        <div className="flex w-screen justify-between" data-tauri-drag-region>
          <div className="flex min-h-8 items-center gap-2 p-1 max-md:pl-2" data-tauri-drag-region>
            <SidebarTrigger
              className={cn(
                "max-md:hidden",
                ["macos", "windows"].includes(platform()) ? "rounded-tl-md" : "",
              )}
            />
            {platform() === "macos" && (
              <>
                <button
                  onClick={() => getCurrentWindow().close()}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      void getCurrentWindow().close();
                    }
                  }}
                  type="button"
                  tabIndex={0}
                  className="group/close flex size-3 items-center justify-center rounded-full bg-red-500 text-white transition-colors hover:bg-red-700 dark:bg-red-400 hover:dark:bg-red-600"
                >
                  <XIcon
                    className="opacity-0 transition-opacity group-hover/close:opacity-100"
                    size={10}
                  />
                </button>
                <button
                  type="button"
                  onClick={() => getCurrentWindow().minimize()}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      void getCurrentWindow().minimize();
                    }
                  }}
                  tabIndex={0}
                  className="group/minimize flex size-3 items-center justify-center rounded-full bg-yellow-500 text-white transition-colors hover:bg-yellow-700 dark:bg-yellow-300 hover:dark:bg-yellow-600"
                >
                  <MinimizeIcon
                    className="opacity-0 transition-opacity group-hover/minimize:opacity-100"
                    size={10}
                  />
                </button>
                <button
                  type="button"
                  onClick={() => getCurrentWindow().toggleMaximize()}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      void getCurrentWindow().toggleMaximize();
                    }
                  }}
                  tabIndex={0}
                  className="group/maximize flex size-3 items-center justify-center rounded-full bg-green-500 text-white transition-colors hover:bg-green-700 dark:bg-green-500 hover:dark:bg-green-600"
                >
                  <MaximizeIcon
                    className="opacity-0 transition-opacity group-hover/maximize:opacity-100"
                    size={8}
                  />
                </button>
              </>
            )}
          </div>
          <div className="flex w-full items-center justify-end gap-2 px-3" data-tauri-drag-region>
            {platform() === "windows" && (
              <>
                <Button
                  onClick={() => getCurrentWindow().minimize()}
                  size="icon-sm"
                  variant="ghost"
                >
                  <MinimizeIcon className="hover:text-warning transition-colors" size={16} />
                </Button>
                <Button
                  onClick={() => getCurrentWindow().toggleMaximize()}
                  size="icon-sm"
                  variant="ghost"
                >
                  <MaximizeIcon className="hover:text-success transition-colors" size={16} />
                </Button>
                <Button onClick={() => getCurrentWindow().close()} size="icon-sm" variant="ghost">
                  <XIcon className="hover:text-destructive transition-colors" size={16} />
                </Button>
              </>
            )}
          </div>
        </div>
        <AppSidebar />
      </Sidebar>
      <SidebarInset>
        <Outlet />
      </SidebarInset>
      {import.meta.env.DEV && <Devtools />}
      <RootComponents />
      <Toaster richColors theme={darkMode ? "dark" : "light"} />
    </React.Fragment>
  );
}

function Devtools() {
  const TanStackDevtools = React.lazy(() =>
    import("@tanstack/react-devtools").then((m) => ({ default: m.TanStackDevtools })),
  );
  const ReactQueryDevtoolsPanel = React.lazy(() =>
    import("@tanstack/react-query-devtools").then((m) => ({
      default: m.ReactQueryDevtoolsPanel,
    })),
  );
  const TanStackRouterDevtoolsPanel = React.lazy(() =>
    import("@tanstack/react-router-devtools").then((m) => ({
      default: m.TanStackRouterDevtoolsPanel,
    })),
  );
  return (
    <React.Suspense>
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
        config={{
          hideUntilHover: true,
          position: "top-right",
          customTrigger: () => (
            <span className="opacity-0 transition-opacity hover:opacity-100">Devtools</span>
          ),
        }}
      />
    </React.Suspense>
  );
}
