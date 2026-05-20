import { TanStackDevtools } from "@tanstack/react-devtools";

import "@/App.css";
import type { QueryClient } from "@tanstack/react-query";
import { ReactQueryDevtoolsPanel } from "@tanstack/react-query-devtools";
import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import { relaunch } from "@tauri-apps/plugin-process";
import * as React from "react";
import { Toaster, toast } from "sonner";

import { AppSidebar } from "@/components/sidebars/app.sidebar";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogCreateHandle,
} from "@/components/ui/alert-dialog";
import { CommandCreateHandle, CommandDialog, CommandDialogPopup } from "@/components/ui/command";
import { Dialog, DialogContent, DialogCreateHandle } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerCreateHandle } from "@/components/ui/drawer";
import { DropdownMenuContent, Menu, MenuCreateHandle } from "@/components/ui/menu";
import { Popover, PopoverContent, PopoverCreateHandle } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sidebar, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { Tooltip, TooltipContent, TooltipCreateHandle } from "@/components/ui/tooltip";
import { useUpdater } from "@/hooks/use-updater";
import { useSettingsStore } from "@/stores/settings";

export const Route = createRootRouteWithContext<{
  queryClient: QueryClient;
}>()({
  component: RootComponent,
});

export const rootDialogHandle = DialogCreateHandle<React.ComponentType>();
export const rootTooltipHandle = TooltipCreateHandle<React.ComponentType>();
export const rootPopoverHandle = PopoverCreateHandle<React.ComponentType>();
export const rootDrawerHandle = DrawerCreateHandle<React.ComponentType>();
export const rootMenuHandle = MenuCreateHandle<React.ComponentType>();
export const rootCommandHandle = CommandCreateHandle<React.ComponentType>();
export const rootAlertDialogHandle = AlertDialogCreateHandle<React.ComponentType>();

function RootComponent() {
  // Stores
  const { darkMode } = useSettingsStore();

  // Queries
  const { data: update } = useUpdater();

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
                  setTimeout(() => {
                    relaunch();
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
  }, [update]);

  return (
    <React.Fragment>
      <Sidebar variant="inset" collapsible="icon">
        <AppSidebar />
      </Sidebar>
      <SidebarInset>
        <SidebarTrigger className="absolute top-1 left-1" />
        <Outlet />
      </SidebarInset>
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
      <Tooltip handle={rootTooltipHandle}>
        {({ payload: Payload }) => <TooltipContent>{Payload && <Payload />}</TooltipContent>}
      </Tooltip>
      <Dialog handle={rootDialogHandle}>
        {({ payload: Payload }) => (
          <DialogContent>
            <ScrollArea className="h-full px-6 pb-6" scrollFade>
              {Payload && <Payload />}
            </ScrollArea>
          </DialogContent>
        )}
      </Dialog>
      <Drawer handle={rootDrawerHandle}>
        {({ payload: Payload }) => (
          <DrawerContent>
            <ScrollArea className="h-full" scrollFade>
              {Payload && <Payload />}
            </ScrollArea>
          </DrawerContent>
        )}
      </Drawer>
      <Popover handle={rootPopoverHandle}>
        {({ payload: Payload }) => <PopoverContent>{Payload && <Payload />}</PopoverContent>}
      </Popover>
      <AlertDialog handle={rootAlertDialogHandle}>
        {({ payload: Payload }) => (
          <AlertDialogContent>
            <ScrollArea className="h-full" scrollFade>
              {Payload && <Payload />}
            </ScrollArea>
          </AlertDialogContent>
        )}
      </AlertDialog>
      <Menu handle={rootMenuHandle}>
        {({ payload: Payload }) => (
          <DropdownMenuContent>{Payload && <Payload />}</DropdownMenuContent>
        )}
      </Menu>
      <CommandDialog handle={rootCommandHandle}>
        {({ payload: Payload }) => (
          <CommandDialogPopup>{Payload && <Payload />}</CommandDialogPopup>
        )}
      </CommandDialog>
      <Toaster richColors theme={darkMode ? "dark" : "light"} />
    </React.Fragment>
  );
}
