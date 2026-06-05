import { ImageIcon } from "lucide-react";
import { useState } from "react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const ICONS = [
  "bogfort.png",
  "butterfly.png",
  "castleruin.png",
  "cow.png",
  "elk.png",
  "family1.png",
  "fishandtherain.png",
  "forestdawn.png",
  "glam.png",
  "howl.png",
  "hunter.png",
  "hunterintheforest.png",
  "iris.png",
  "oldvillage.png",
  "prey.png",
  "seraph.png",
  "sleepingwolf.png",
  "traveler.png",
  "uncle1.png",
  "underwater.png",
];

const ICON_BASE = "/installation-icons";

export type InstallationIconPickerProps = {
  value: string | null;
  onChange: (icon: string | null) => void;
};

export function InstallationIconPicker({ value, onChange }: InstallationIconPickerProps) {
  const [open, setOpen] = useState(false);

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger
        className={cn(
          "flex size-14 items-center justify-center border bg-muted/50 hover:bg-muted transition-colors",
          !value && "border-dashed",
        )}
      >
        {value ? (
          <img
            alt="Selected icon"
            className="size-10 object-contain"
            src={`${ICON_BASE}/${value}`}
          />
        ) : (
          <ImageIcon className="text-muted-foreground size-5" />
        )}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72" side="bottom" sideOffset={8}>
        <div className="grid grid-cols-5 gap-2 p-1">
          {value && (
            <button
              className={cn(
                "flex size-12 items-center justify-center border-2 border-destructive/50 bg-destructive/10",
              )}
              onClick={() => {
                onChange(null);
                setOpen(false);
              }}
              type="button"
            >
              <span className="text-destructive text-xs font-medium">None</span>
            </button>
          )}
          {ICONS.map((icon) => (
            <button
              className={cn(
                "flex size-12 items-center justify-center border hover:bg-accent transition-colors",
                value === icon
                  ? "border-primary bg-primary/10 ring-2 ring-primary/20"
                  : "border-transparent",
              )}
              key={icon}
              onClick={() => {
                onChange(icon);
                setOpen(false);
              }}
              type="button"
            >
              <img
                alt={icon.replace(".png", "")}
                className="size-8 object-contain"
                src={`${ICON_BASE}/${icon}`}
              />
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export { ICONS, ICON_BASE };
