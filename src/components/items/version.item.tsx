import { Download } from "lucide-react";
import { DeleteVersionDialog } from "@/components/dialogs/deleteversion.dialog";
import { Badge } from "@/components/ui/badge";

interface VersionItemProps {
	version: string;
}

export function VersionItem({ version }: VersionItemProps) {
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
			<DeleteVersionDialog version={version} />
		</div>
	);
}
