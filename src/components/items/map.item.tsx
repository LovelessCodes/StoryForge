import { MapIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Group } from "@/components/ui/group";
import { TooltipTrigger } from "@/components/ui/tooltip";
import type { MapEntry } from "@/hooks/use-world-map";
import { rootDialogHandle, rootTooltipHandle } from "@/routes/__root";
import { useInstallations } from "@/stores/installations";

import { ViewMapDialog } from "../dialogs/viewmap.dialog";
import { DialogTrigger } from "../ui/dialog";

export function MapItem({ map }: { map: MapEntry }) {
  const { installations } = useInstallations();
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
        <TooltipTrigger
          render={
            <Button
              render={
                <DialogTrigger
                  handle={rootDialogHandle}
                  payload={() => <ViewMapDialog mapPath={map.path} mapName={map.name} />}
                />
              }
              variant="outline"
            >
              <MapIcon aria-hidden="true" className="-ms-1 text-blue-300 opacity-60" size={16} />
            </Button>
          }
          handle={rootTooltipHandle}
          payload={() => "View Map"}
        />
      </Group>
    </div>
  );
}
