import { createFileRoute } from "@tanstack/react-router";
import { FolderPlusIcon } from "lucide-react";
import { AnimatePresence } from "motion/react";
import { MotionVersionContextMenu } from "@/components/context-menus/version.context-menu";
import { VersionRow } from "@/components/rows/version.row";
import { Button } from "@/components/ui/button";
import { ErrorComponent } from "@/components/ui/error";
import { useInstalledVersions } from "@/hooks/use-installed-versions";
import { compareSemverDesc, itemVariants } from "@/lib/utils";
import { useDialogStore } from "@/stores/dialogs";

export const Route = createFileRoute("/versions")({
	component: RouteComponent,
	errorComponent: ErrorComponent,
});

function RouteComponent() {
	// Stores
	const { openDialog } = useDialogStore();

	// Queries
	const { data: versions } = useInstalledVersions();

	return (
		<div className="flex flex-col gap-2 w-full">
			<div className="flex gap-2 h-fit sticky top-0 bg-background/10 backdrop-blur-md z-10 px-4 py-2">
				<Button
					className="w-full justify-between cursor-pointer"
					onClick={() => openDialog("AddVersionDialog")}
					variant="outline"
				>
					<span className="flex text-xs">Add version</span>
					<FolderPlusIcon className="size-4" />
				</Button>
			</div>
			<div className="h-full px-4 relative overflow-auto w-full">
				<div className="flex flex-col w-full bg-card p-2 rounded shadow border relative overflow-y-auto">
					<AnimatePresence>
						{versions.sort(compareSemverDesc).map((version, index) => (
							<MotionVersionContextMenu
								animate="show"
								className="not-last:border-b flex items-center gap-2 py-2 px-2"
								custom={index}
								exit="exit"
								initial="hidden"
								key={`${version}-context-menu`}
								layout="position"
								variants={itemVariants}
								version={version}
							>
								<VersionRow version={version} />
							</MotionVersionContextMenu>
						))}
						{versions.length === 0 && (
							<p className="p-4 text-sm text-muted-foreground select-none">
								No versions yet. Click "Add version" to get started.
							</p>
						)}
					</AnimatePresence>
				</div>
			</div>
		</div>
	);
}
