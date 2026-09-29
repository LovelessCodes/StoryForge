import type { ContextMenu as ContextMenuPrimitive } from "@base-ui/react/context-menu";
import * as m from "motion/react-m";

import { InstallationActions } from "@/components/menus/installation-actions";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { type Installation } from "@/stores/installations";

export const InstallationContextMenu = ({
  installation,
  ...props
}: ContextMenuPrimitive.Trigger.Props & {
  installation: Installation;
}) => {
  return (
    <ContextMenu>
      <ContextMenuTrigger {...props} />
      <ContextMenuContent>
        <ContextMenuGroup>
          <ContextMenuLabel className="text-muted-foreground/50 border-b text-xs font-semibold">
            {installation.name}
          </ContextMenuLabel>
          <InstallationActions installation={installation} item={ContextMenuItem} />
        </ContextMenuGroup>
      </ContextMenuContent>
    </ContextMenu>
  );
};

export const MotionInstallationContextMenu = m.create(InstallationContextMenu);
