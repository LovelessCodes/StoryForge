import { FolderOpenIcon, TrashIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Group, GroupItem, GroupSeparator } from "@/components/ui/group";
import {
	Tooltip,
	TooltipContent,
	TooltipCreateHandle,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAppFolder } from "@/hooks/use-app-folder";
import { useRevealInFolder } from "@/hooks/use-reveal-in-folder";
import { pathDelimiter } from "@/lib/utils";
import { useDialogStore } from "@/stores/dialogs";
import { useSettingsStore } from "@/stores/settings";

const tooltipHandle = TooltipCreateHandle();

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
			<Group>
				<TooltipTrigger
					handle={tooltipHandle}
					payload={() => "Open Folder"}
					render={
						<GroupItem
							render={
								<Button
									aria-label="Open Folder"
									onClick={() =>
										openFolder(
											`${versionsParent ?? appFolder}${pathDelimiter}${versionsSubdir}${pathDelimiter}${version}`,
										)
									}
									size="icon"
									variant="outline"
								/>
							}
						>
							<FolderOpenIcon
								aria-hidden="true"
								className="opacity-60"
								size={16}
							/>
						</GroupItem>
					}
				/>
				<GroupSeparator />
				<TooltipTrigger
					handle={tooltipHandle}
					payload={() => "Delete Version"}
					render={
						<GroupItem
							render={
								<Button
									aria-label="Delete"
									onClick={() => openDialog("DeleteVersionDialog", { version })}
									size="icon"
									variant="outline"
								/>
							}
						>
							<TrashIcon aria-hidden="true" className="opacity-60" size={16} />
						</GroupItem>
					}
				/>
				<Tooltip handle={tooltipHandle}>
					{({ payload: Payload }) =>
						Payload ? (
							<TooltipContent>
								<Payload />
							</TooltipContent>
						) : null
					}
				</Tooltip>
			</Group>
		</>
	);
}
