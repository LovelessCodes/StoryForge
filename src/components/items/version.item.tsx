import { Download, XIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useDialogStore } from "@/stores/dialogs";

interface VersionItemProps {
  version: string;
}

export function VersionItem({ version }: VersionItemProps) {
  const { openDialog } = useDialogStore();
  return (
    <div className="hover:bg-muted/50 flex items-center justify-between rounded-lg border p-4 transition-colors">
      <div className="flex items-center gap-3">
        <div className="bg-primary/10 flex h-10 w-10 items-center justify-center rounded-lg">
          <Download className="text-primary h-5 w-5" />
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
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              aria-label="Delete"
              onClick={() => openDialog("DeleteVersionDialog", { version })}
              size="icon"
              variant="outline"
            >
              <XIcon aria-hidden="true" className="opacity-60" size={16} />
            </Button>
          }
        />
        <TooltipContent>Delete</TooltipContent>
      </Tooltip>
    </div>
  );
}
