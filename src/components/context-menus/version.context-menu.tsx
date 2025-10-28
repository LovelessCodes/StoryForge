import type { ContextMenu as ContextMenuPrimitive } from "@base-ui-components/react/context-menu";
import { FolderOpenIcon, TrashIcon } from "lucide-react";
import { motion } from "motion/react";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { useAppFolder } from "@/hooks/use-app-folder";
import { useRevealInFolder } from "@/hooks/use-reveal-in-folder";
import { pathDelimiter } from "@/lib/utils";
import { useDialogStore } from "@/stores/dialogs";
import { useSettingsStore } from "@/stores/settings";

export const VersionContextMenu = ({
	version,
	...props
}: ContextMenuPrimitive.Trigger.Props & {
	version: string;
}) => {
	const { appFolder } = useAppFolder();

	// Stores
	const { openDialog } = useDialogStore();
	const { versionsParent, versionsSubdir } = useSettingsStore();

	// Mutations
	const { mutate: openFolder } = useRevealInFolder();

	return (
		<ContextMenu>
			<ContextMenuTrigger {...props} />
			<ContextMenuContent>
				<ContextMenuItem
					className="flex items-center justify-between gap-4"
					onClick={() =>
						openFolder(
							`${versionsParent ?? appFolder}${pathDelimiter}${versionsSubdir}${pathDelimiter}${version}`,
						)
					}
				>
					Open Folder
					<FolderOpenIcon className="inline-block h-4 w-4" />
				</ContextMenuItem>
				<ContextMenuItem
					className="flex items-center justify-between gap-4"
					onClick={() => openDialog("DeleteVersionDialog", { version })}
					variant="destructive"
				>
					Delete
					<TrashIcon className="inline-block h-4 w-4" />
				</ContextMenuItem>
			</ContextMenuContent>
		</ContextMenu>
	);
};

export const MotionVersionContextMenu = motion.create(VersionContextMenu);
