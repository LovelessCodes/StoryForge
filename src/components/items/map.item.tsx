import { MapIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Group, GroupItem } from "@/components/ui/group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { MapEntry } from "@/hooks/use-world-map";
import { useDialogStore } from "@/stores/dialogs";
import { useInstallations } from "@/stores/installations";

export function MapItem({ map }: { map: MapEntry }) {
  const { installations } = useInstallations();
  const { openDialog } = useDialogStore();
  const installation = installations.find((inst) => inst.id === map.installation_id);

  return (
    <div className="grid w-full grid-cols-3 items-center justify-between">
      <div className="flex flex-col">
        <p className="text-sm">{map.name}</p>
        <p className="text-muted-foreground text-xs">
          {installation?.name ?? map.installation_name}
        </p>
      </div>
      <div className="flex flex-col">
        <p className="text-muted-foreground text-sm">Standalone map</p>
        <p className="text-muted-foreground text-xs">No save attached</p>
      </div>
      <Group className="w-full justify-end">
        <Tooltip>
          <TooltipTrigger
            render={
              <GroupItem
                render={
                  <Button
                    onClick={() =>
                      openDialog("ViewMapDialog", {
                        mapPath: map.path,
                        mapName: map.name,
                      })
                    }
                    variant="outline"
                  />
                }
              >
                <MapIcon aria-hidden="true" className="-ms-1 text-blue-300 opacity-60" size={16} />
              </GroupItem>
            }
          />
          <TooltipContent>View Map</TooltipContent>
        </Tooltip>
      </Group>
    </div>
  );
}
