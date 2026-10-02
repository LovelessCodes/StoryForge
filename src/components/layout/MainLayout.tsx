import { useHotkey } from "@tanstack/react-hotkeys";
import { useIsFetching, useQueryClient } from "@tanstack/react-query";
import { Outlet, useRouterState } from "@tanstack/react-router";
import { useCallback, useState } from "react";

import { PAGE_PATHS } from "@/lib/routes";

import CommandPalette from "../command-palette";
import { CommandRuntimeProvider } from "../command-runtime";
import { ScrollArea } from "../ui/scroll-area";
import { SidebarInset, SidebarProvider } from "../ui/sidebar";
import Header from "./Header";
import Sidebar from "./Sidebar";
import Titlebar from "./Titlebar";

export default function MainLayout() {
  // Read the leaf match rather than `location`: during a navigation the
  // location flips immediately while the Outlet still renders the old page
  // until its loaders resolve. Deriving the scroll wrapper from anything but
  // the rendered match re-parents the old page mid-flight, and a virtualized
  // list then measures every row of its unbounded viewport.
  const pathname = useRouterState({
    select: (s) => s.matches[s.matches.length - 1]?.pathname ?? s.location.pathname,
  });
  const queryClient = useQueryClient();
  const [commandOpen, setCommandOpen] = useState(false);

  useHotkey("Mod+K", () => setCommandOpen((open) => !open));

  const fetching = useIsFetching();

  const handleRefresh = useCallback(async () => {
    await queryClient.refetchQueries();
  }, [queryClient]);

  const onStaticPage = Object.values(PAGE_PATHS).some((path) => pathname === path);
  const showRefresh = onStaticPage || pathname.startsWith("/server-hosting");

  // Pages with their own scroll containers (virtualized lists, editors).
  const managesOwnScroll =
    pathname === PAGE_PATHS.mods ||
    pathname === PAGE_PATHS.servers ||
    pathname === PAGE_PATHS.config ||
    pathname.endsWith("/mods");

  return (
    <SidebarProvider className="h-svh overflow-hidden">
      <CommandRuntimeProvider onCommandOpenChange={setCommandOpen}>
        <Titlebar />
        <Sidebar />
        <SidebarInset data-tauri-drag-region={false} className="min-w-0 overflow-hidden">
          <Header onRefresh={showRefresh ? handleRefresh : undefined} isRefreshing={fetching > 0} />
          {managesOwnScroll ? (
            <div className="min-h-0 flex-1 p-6">
              <Outlet />
            </div>
          ) : (
            <ScrollArea scrollFade className="min-h-0 flex-1">
              <div className="p-6">
                <Outlet />
              </div>
            </ScrollArea>
          )}
        </SidebarInset>

        <CommandPalette open={commandOpen} onOpenChange={setCommandOpen} />
      </CommandRuntimeProvider>
    </SidebarProvider>
  );
}
