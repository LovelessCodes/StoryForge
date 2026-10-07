import { Dialog as SheetPrimitive } from "@base-ui/react/dialog";
import { cn } from "cn";
import { XIcon } from "lucide-react";
import * as React from "react";
import { useTranslation } from "react-i18next";

import { Button } from "./button";

type SheetSide = "top" | "right" | "bottom" | "left";

/**
 * Whether the sheet is open, shared with the overlay and popup so they can
 * drive their own enter transition.
 *
 * Base UI animates the popup from `data-starting-style`, but it skips that
 * when a popup mounts already open — which is the norm here, because sheets
 * are remounted on open (and re-keyed) to reset their forms. The popup and
 * overlay therefore apply the starting styles themselves for the first frames
 * after opening; Base UI's `data-ending-style` still covers the exit.
 */
const SheetOpenContext = React.createContext(false);

/** True while the first frames after opening should stay offset. */
function useEntering(): boolean {
  const open = React.useContext(SheetOpenContext);
  const [tracked, setTracked] = React.useState({ open, entering: open });

  // Adjust during render when `open` flips so the starting styles are part of
  // the same commit that reveals the popup (an effect would be too late).
  if (tracked.open !== open) {
    setTracked({ open, entering: open });
  }
  const entering = tracked.open === open ? tracked.entering : open;

  React.useLayoutEffect(() => {
    if (!open) return undefined;
    let second = 0;
    // Two frames: one paints the offset, the next removes it so the
    // transition runs. Re-scheduled on every setup so StrictMode's
    // double-invoked effects can't cancel the chain for good.
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => {
        setTracked((state) => (state.entering ? { ...state, entering: false } : state));
      });
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, [open]);

  return entering;
}

const enterFromSide: Record<SheetSide, string> = {
  bottom: "translate-y-[2.5rem]",
  left: "-translate-x-[2.5rem]",
  right: "translate-x-[2.5rem]",
  top: "-translate-y-[2.5rem]",
};

function Sheet({ defaultOpen, open, ...props }: SheetPrimitive.Root.Props) {
  return (
    <SheetOpenContext.Provider value={open ?? defaultOpen ?? false}>
      <SheetPrimitive.Root data-slot="sheet" defaultOpen={defaultOpen} open={open} {...props} />
    </SheetOpenContext.Provider>
  );
}

function SheetTrigger({ ...props }: SheetPrimitive.Trigger.Props) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />;
}

function SheetClose({ ...props }: SheetPrimitive.Close.Props) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />;
}

function SheetPortal({ ...props }: SheetPrimitive.Portal.Props) {
  return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />;
}

function SheetOverlay({ className, ...props }: SheetPrimitive.Backdrop.Props) {
  const entering = useEntering();
  return (
    <SheetPrimitive.Backdrop
      data-slot="sheet-overlay"
      className={cn(
        "fixed inset-0 z-50 bg-black/10 text-xs/relaxed transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0 supports-backdrop-filter:backdrop-blur-xs",
        entering && "opacity-0",
        className,
      )}
      {...props}
    />
  );
}

function SheetContent({
  className,
  children,
  side = "right",
  showCloseButton = true,
  ...props
}: SheetPrimitive.Popup.Props & {
  side?: SheetSide;
  showCloseButton?: boolean;
}) {
  const { t } = useTranslation();
  const entering = useEntering();
  return (
    <SheetPortal>
      <SheetOverlay />
      <SheetPrimitive.Popup
        data-slot="sheet-content"
        data-side={side}
        className={cn(
          "fixed z-50 flex flex-col bg-popover bg-clip-padding text-xs/relaxed text-popover-foreground shadow-lg transition duration-200 ease-in-out data-ending-style:opacity-0 data-starting-style:opacity-0 data-[side=bottom]:inset-x-0 data-[side=bottom]:bottom-0 data-[side=bottom]:h-auto data-[side=bottom]:border-t data-[side=bottom]:data-ending-style:translate-y-[2.5rem] data-[side=bottom]:data-starting-style:translate-y-[2.5rem] data-[side=left]:inset-y-0 data-[side=left]:left-0 data-[side=left]:h-full data-[side=left]:border-r data-[side=left]:data-ending-style:translate-x-[-2.5rem] data-[side=left]:data-starting-style:translate-x-[-2.5rem] data-[side=right]:inset-y-0 data-[side=right]:right-0 data-[side=right]:h-full data-[side=right]:border-l data-[side=right]:data-ending-style:translate-x-[2.5rem] data-[side=right]:data-starting-style:translate-x-[2.5rem] data-[side=top]:inset-x-0 data-[side=top]:top-0 data-[side=top]:h-auto data-[side=top]:border-b data-[side=top]:data-ending-style:translate-y-[-2.5rem] data-[side=top]:data-starting-style:translate-y-[-2.5rem]",
          entering && cn("opacity-0", enterFromSide[side]),
          className,
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <SheetPrimitive.Close
            data-slot="sheet-close"
            render={<Button variant="ghost" className="absolute top-3 right-3" size="icon-sm" />}
          >
            <XIcon />
            <span className="sr-only">{t("common.actions.close")}</span>
          </SheetPrimitive.Close>
        )}
      </SheetPrimitive.Popup>
    </SheetPortal>
  );
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-header"
      className={cn("flex flex-col gap-0.5 p-4", className)}
      {...props}
    />
  );
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn("mt-auto flex flex-col gap-2 p-4", className)}
      {...props}
    />
  );
}

function SheetTitle({ className, ...props }: SheetPrimitive.Title.Props) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn("font-heading text-sm font-medium text-foreground", className)}
      {...props}
    />
  );
}

function SheetDescription({ className, ...props }: SheetPrimitive.Description.Props) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn("text-xs/relaxed text-muted-foreground", className)}
      {...props}
    />
  );
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
};
