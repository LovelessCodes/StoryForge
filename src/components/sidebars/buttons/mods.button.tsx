import { Link, useParams } from "@tanstack/react-router";
import { PackagePlusIcon } from "lucide-react";

import { SidebarMenuSubItem, SidebarMenuSubButton } from "@/components/ui/sidebar";

export function ModsButton() {
  const params = useParams({ strict: false });
  const id = params.id as string | undefined;

  return (
    <SidebarMenuSubItem>
      <SidebarMenuSubButton
        className="truncate"
        size="sm"
        render={
          id ? (
            <Link
              to="/installations/$id/mods"
              params={{ id }}
              activeProps={{ "data-active": true }}
            />
          ) : (
            <span />
          )
        }
      >
        <PackagePlusIcon />
        Mods
      </SidebarMenuSubButton>
    </SidebarMenuSubItem>
  );
}
