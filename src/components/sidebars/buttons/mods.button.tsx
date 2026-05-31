import { useLoaderData } from "@tanstack/react-router";
import { PackagePlusIcon } from "lucide-react";

import { SidebarMenuSubItem, SidebarMenuSubButton } from "@/components/ui/sidebar";

export function ModsButton() {
  const { installation } = useLoaderData({ from: "/install-mods/$id" });
  return (
    <SidebarMenuSubItem>
      <SidebarMenuSubButton className="truncate" size="sm" isActive>
        <PackagePlusIcon />
        {installation.name}
      </SidebarMenuSubButton>
    </SidebarMenuSubItem>
  );
}
