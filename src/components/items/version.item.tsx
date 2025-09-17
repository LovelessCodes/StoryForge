import { Download, XIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useDialogStore } from "@/stores/dialogs";
import { Button } from "../ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";

interface VersionItemProps {
	version: string;
}

export function VersionItem({ version }: VersionItemProps) {
	const { openDialog } = useDialogStore();
	return (
		<div className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors">
			<div className="flex items-center gap-3">
				<div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
					<Download className="w-5 h-5 text-primary" />
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
				<TooltipTrigger asChild>
					<Button
						aria-label="Delete"
						className="rounded-none shadow-none first:rounded-s-md last:rounded-e-md focus-visible:z-10"
						onClick={() => openDialog("DeleteVersionDialog", { version })}
						size="icon"
						variant="outline"
					>
						<XIcon aria-hidden="true" className="opacity-60" size={16} />
					</Button>
				</TooltipTrigger>
				<TooltipContent>Delete</TooltipContent>
			</Tooltip>
		</div>
	);
}
