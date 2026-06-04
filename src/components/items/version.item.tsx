import { Download, XIcon } from "lucide-react";

import { DeleteVersionDialog } from "@/components/dialogs/deleteversion.dialog";
import { AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TooltipTrigger } from "@/components/ui/tooltip";
import { rootAlertDialogHandle, rootTooltipHandle } from "@/handles";

interface VersionItemProps {
  version: string;
}

export function VersionItem({ version }: VersionItemProps) {
  return (
    <div className="hover:bg-muted/50 flex items-center justify-between border p-4 transition-colors">
      <div className="flex items-center gap-3">
        <div className="bg-primary/10 flex size-10 items-center justify-center">
          <Download className="text-primary size-5" />
        </div>
        <div className="flex gap-2">
          <Badge className="font-mono" variant="outline">
            {version}
          </Badge>
          <Badge className="font-mono" variant="outline">
            StoryForge/versions/{version}/
          </Badge>
        </div>
      </div>
      <TooltipTrigger
        render={
          <Button
            aria-label="Delete"
            render={
              <AlertDialogTrigger
                handle={rootAlertDialogHandle}
                payload={() => <DeleteVersionDialog version={version} />}
              />
            }
            size="icon"
            variant="outline"
          >
            <XIcon aria-hidden="true" className="opacity-60" size={16} />
          </Button>
        }
        handle={rootTooltipHandle}
        payload={() => "Delete"}
      />
    </div>
  );
}
