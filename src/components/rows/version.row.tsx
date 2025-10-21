import { FolderOpenIcon, TrashIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAppFolder } from "@/hooks/use-app-folder";
import { useRevealInFolder } from "@/hooks/use-reveal-in-folder";
import { pathDelimiter } from "@/lib/utils";
import { useDialogStore } from "@/stores/dialogs";
import { useSettingsStore } from "@/stores/settings";

export function VersionRow({ version }: { version: string }) {
	const { appFolder } = useAppFolder();

	// Stores
	const { openDialog } = useDialogStore();
	const { versionsParent, versionsSubdir } = useSettingsStore();

	// Mutations
	const { mutate: openFolder } = useRevealInFolder();

	return (
		<>
			<span className="flex-1 text-sm">
				{version}
				{version.includes("rc") && (
					<span className="text-xs text-muted-foreground opacity-50 ml-2">
						(Release Candidate)
					</span>
				)}
			</span>
			<div className="inline-flex -space-x-px rounded-md shadow-xs rtl:space-x-reverse">
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							aria-label="Open Folder"
							className="rounded-none shadow-none first:rounded-s-md last:rounded-e-md focus-visible:z-10"
							onClick={() =>
								openFolder(
									`${versionsParent ?? appFolder}${pathDelimiter}${versionsSubdir}${pathDelimiter}${version}`,
								)
							}
							size="icon"
							variant="outline"
						>
							<FolderOpenIcon
								aria-hidden="true"
								className="opacity-60"
								size={16}
							/>
						</Button>
					</TooltipTrigger>
					<TooltipContent>Open Folder</TooltipContent>
				</Tooltip>
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							aria-label="Delete"
							className="rounded-none shadow-none first:rounded-s-md last:rounded-e-md focus-visible:z-10"
							onClick={() => openDialog("DeleteVersionDialog", { version })}
							size="icon"
							variant="outline"
						>
							<TrashIcon aria-hidden="true" className="opacity-60" size={16} />
						</Button>
					</TooltipTrigger>
					<TooltipContent>Delete</TooltipContent>
				</Tooltip>
			</div>
		</>
	);
}
