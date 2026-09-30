"use client";

import { Toggle as TogglePrimitive } from "@base-ui/react/toggle";
import type React from "react";

import { toggleVariants, type ToggleVariants } from "@/components/ui/toggle.variants";
import { cn } from "@/lib/utils";

export function Toggle({
  className,
  variant,
  size,
  ...props
}: TogglePrimitive.Props & ToggleVariants): React.ReactElement {
  return (
    <TogglePrimitive
      className={cn(toggleVariants({ className, size, variant }))}
      data-slot="toggle"
      {...props}
    />
  );
}
