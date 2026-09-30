import { AlertDialog as AlertDialogPrimitive } from "@base-ui/react/alert-dialog";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { Drawer as DrawerPrimitive } from "@base-ui/react/drawer";
import { Menu as MenuPrimitive } from "@base-ui/react/menu";
import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip";

export const rootDialogHandle = DialogPrimitive.createHandle<React.ComponentType>();
export const rootTooltipHandle = TooltipPrimitive.createHandle<React.ComponentType>();
export const rootPopoverHandle = PopoverPrimitive.createHandle<React.ComponentType>();
export const rootDrawerHandle = DrawerPrimitive.createHandle<React.ComponentType>();
export const rootMenuHandle = MenuPrimitive.createHandle<React.ComponentType>();
export const rootCommandHandle = DialogPrimitive.createHandle<React.ComponentType>();
export const rootAlertDialogHandle = AlertDialogPrimitive.createHandle<React.ComponentType>();
