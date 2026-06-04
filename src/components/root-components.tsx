import { AlertDialog, AlertDialogContent } from "@/components/ui/alert-dialog";
import { CommandDialog, CommandDialogPopup } from "@/components/ui/command";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Drawer, DrawerContent } from "@/components/ui/drawer";
import { DropdownMenuContent, Menu } from "@/components/ui/menu";
import { Popover, PopoverContent } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent } from "@/components/ui/tooltip";
import {
  rootTooltipHandle,
  rootDialogHandle,
  rootAlertDialogHandle,
  rootCommandHandle,
  rootDrawerHandle,
  rootMenuHandle,
  rootPopoverHandle,
} from "@/handles";

export function RootComponents() {
  return (
    <>
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
    </>
  );
}
