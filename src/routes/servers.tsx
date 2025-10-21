import { createFileRoute } from "@tanstack/react-router";
import { MapPinPlusIcon } from "lucide-react";
import { AnimatePresence } from "motion/react";
import { MotionServerContextMenu } from "@/components/context-menus/server.context-menu";
import { ServerRow } from "@/components/rows/server.row";
import { Button } from "@/components/ui/button";
import { ErrorComponent } from "@/components/ui/error";
import { itemVariants } from "@/lib/utils";
import { useDialogStore } from "@/stores/dialogs";
import { useServerStore } from "@/stores/servers";

export const Route = createFileRoute("/servers")({
	component: RouteComponent,
	errorComponent: ErrorComponent,
});

function RouteComponent() {
	// Stores
	const { servers } = useServerStore();
	const { openDialog } = useDialogStore();

	return (
		<div
			className="grid grid-rows-[min-content_1fr] gap-2 w-full"
			style={{ height: "100vh" }}
		>
			<div className="flex flex-col gap-2 w-full justify-start">
				<div className="flex gap-2 h-fit sticky top-0 bg-background/10 backdrop-blur-md z-10 px-4 py-2">
					<Button
						className="w-full justify-between cursor-pointer"
						onClick={() => openDialog("AddServerDialog")}
						variant="outline"
					>
						<span className="flex text-xs">Add server</span>
						<MapPinPlusIcon className="size-4" />
					</Button>
				</div>
				<div className="h-full px-4 relative overflow-auto w-full">
					<div className="flex flex-col w-full bg-card p-2 rounded shadow border relative overflow-y-auto">
						<AnimatePresence>
							{servers
								.sort((a, b) => a.index - b.index)
								.map((server, index) => (
									<MotionServerContextMenu
										animate="show"
										className="not-last:border-b"
										custom={index}
										exit="exit"
										initial="hidden"
										key={`${server.id}-context-menu`}
										layout="position"
										server={server}
										variants={itemVariants}
									>
										<ServerRow server={server} />
									</MotionServerContextMenu>
								))}
							{servers.length === 0 && (
								<p className="p-4 text-sm text-muted-foreground select-none">
									No servers yet. Click "Add server" to get started.
								</p>
							)}
						</AnimatePresence>
					</div>
				</div>
			</div>
		</div>
	);
}
