import { AlertDialogCreateHandle } from "@/components/ui/alert-dialog";
import { CommandCreateHandle } from "@/components/ui/command";
import { DialogCreateHandle } from "@/components/ui/dialog";
import { DrawerCreateHandle } from "@/components/ui/drawer";
import { MenuCreateHandle } from "@/components/ui/menu";
import { PopoverCreateHandle } from "@/components/ui/popover";
import { TooltipCreateHandle } from "@/components/ui/tooltip";

export const rootDialogHandle = DialogCreateHandle<React.ComponentType>();
export const rootTooltipHandle = TooltipCreateHandle<React.ComponentType>();
export const rootPopoverHandle = PopoverCreateHandle<React.ComponentType>();
export const rootDrawerHandle = DrawerCreateHandle<React.ComponentType>();
export const rootMenuHandle = MenuCreateHandle<React.ComponentType>();
export const rootCommandHandle = CommandCreateHandle<React.ComponentType>();
export const rootAlertDialogHandle = AlertDialogCreateHandle<React.ComponentType>();
