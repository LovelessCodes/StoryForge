import { useParams } from "@tanstack/react-router";
import { PackageOpenIcon } from "lucide-react";

import { SidebarMenuSubItem, SidebarMenuSubButton } from "@/components/ui/sidebar";
import { useInstallations } from "@/stores/installations";

export function ModConfigsButton() {
  const { id } = useParams({ from: "/mod-configs/$id" });
  const { installations } = useInstallations();
  const installation = installations.find((i) => i?.id === Number(id));

  return (
    <SidebarMenuSubItem>
      <SidebarMenuSubButton className="truncate" size="sm" isActive>
        <PackageOpenIcon />
        {installation?.name}
      </SidebarMenuSubButton>
    </SidebarMenuSubItem>
  );
}
