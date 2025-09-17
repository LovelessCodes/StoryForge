import { AppSidebar } from "@/components/sidebars/app.sidebar";
import "../App.css";
import { TanStackDevtools } from "@tanstack/react-devtools";
import type { QueryClient } from "@tanstack/react-query";
import { ReactQueryDevtoolsPanel } from "@tanstack/react-query-devtools";
import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import { relaunch } from "@tauri-apps/plugin-process";
import * as React from "react";
import { toast } from "sonner";
import { AddInstallationDialog } from "@/components/dialogs/addinstallation.dialog";
import { AddModDialog } from "@/components/dialogs/addmod.dialog";
import { AddServerDialog } from "@/components/dialogs/addserver.dialog";
import { AddUserDialog } from "@/components/dialogs/adduser.dialog";
import { AddVersionDialog } from "@/components/dialogs/addversion.dialog";
import { ConnectServerDialog } from "@/components/dialogs/connectserver.dialog";
import { DeleteInstallationDialog } from "@/components/dialogs/deleteinstallation.dialog";
import { DeleteServerDialog } from "@/components/dialogs/deleteserver.dialog";
import { DeleteVersionDialog } from "@/components/dialogs/deleteversion.dialog";
import { EditInstallationDialog } from "@/components/dialogs/editinstallation.dialog";
import { EditServerDialog } from "@/components/dialogs/editserver.dialog";
import { ImportInstallationDialog } from "@/components/dialogs/importinstallation.dialog";
import { RemoveModDialog } from "@/components/dialogs/removemod.dialog";
import { UpdateModDialog } from "@/components/dialogs/updatemod.dialog";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useUpdater } from "@/hooks/use-updater";
import { type DialogMap, useDialogStore } from "@/stores/dialogs";

export const Route = createRootRouteWithContext<{
	queryClient: QueryClient;
}>()({
	component: RootComponent,
});

function RootComponent() {
	const { data: update } = useUpdater();
	const { active } = useDialogStore();

	React.useEffect(() => {
		if (update) {
			let downloaded: number = 0;
			let contentLength: number | undefined = 0;
			toast("A new update is available!", {
				action: {
					label: "Install",
					onClick: () =>
						update.downloadAndInstall((event) => {
							switch (event.event) {
								case "Started":
									contentLength = event.data.contentLength;
									toast.info("Updating", {
										description: "Starting download...",
										id: "updater",
									});
									break;
								case "Progress":
									downloaded = event.data.chunkLength;
									toast.info("Updating", {
										description: `Downloaded ${downloaded} of ${contentLength} bytes`,
										id: "updater",
									});
									break;
								case "Finished":
									toast.success("Updated", {
										description: "The application will restart now.",
										id: "updater",
									});
									setTimeout(() => {
										relaunch();
									}, 2500);
									break;
							}
						}),
				},
				description: `Version ${update.version} is available.`,
				dismissible: true,
				duration: Number.POSITIVE_INFINITY,
				id: "update-available",
			});
		}
	}, [update]);

	return (
		<React.Fragment>
			<AppSidebar />
			<main className="flex flex-1">
				<SidebarTrigger className="md:hidden h-full items-start pt-2 border-r" />
				<Outlet />
			</main>
			<TanStackDevtools
				plugins={[
					{
						name: "Query",
						render: <ReactQueryDevtoolsPanel />,
					},
					{
						name: "Router",
						render: <TanStackRouterDevtoolsPanel />,
					},
				]}
			/>
			{active?.key === "AddInstallationDialog" && (
				<AddInstallationDialog open={active?.key === "AddInstallationDialog"} />
			)}
			{active?.key === "AddModDialog" && (
				<AddModDialog
					open={active?.key === "AddModDialog"}
					{...((active?.key === "AddModDialog"
						? active.props
						: {}) as DialogMap["AddModDialog"])}
				/>
			)}
			{active?.key === "AddServerDialog" && (
				<AddServerDialog
					open={active?.key === "AddServerDialog"}
					{...((active?.key === "AddServerDialog"
						? active.props
						: {}) as DialogMap["AddServerDialog"])}
				/>
			)}
			{active?.key === "AddUserDialog" && (
				<AddUserDialog open={active?.key === "AddUserDialog"} />
			)}
			{active?.key === "AddVersionDialog" && (
				<AddVersionDialog open={active?.key === "AddVersionDialog"} />
			)}
			{active?.key === "ConnectServerDialog" && (
				<ConnectServerDialog
					open={active?.key === "ConnectServerDialog"}
					{...((active?.key === "ConnectServerDialog"
						? active.props
						: {}) as DialogMap["ConnectServerDialog"])}
				/>
			)}
			{active?.key === "DeleteInstallationDialog" && (
				<DeleteInstallationDialog
					open={active?.key === "DeleteInstallationDialog"}
					{...((active?.key === "DeleteInstallationDialog"
						? active.props
						: {}) as DialogMap["DeleteInstallationDialog"])}
				/>
			)}
			{active?.key === "DeleteServerDialog" && (
				<DeleteServerDialog
					open={active?.key === "DeleteServerDialog"}
					{...((active?.key === "DeleteServerDialog"
						? active.props
						: {}) as DialogMap["DeleteServerDialog"])}
				/>
			)}
			{active?.key === "DeleteVersionDialog" && (
				<DeleteVersionDialog
					open={active?.key === "DeleteVersionDialog"}
					{...((active?.key === "DeleteVersionDialog"
						? active.props
						: {}) as DialogMap["DeleteVersionDialog"])}
				/>
			)}
			{active?.key === "EditInstallationDialog" && (
				<EditInstallationDialog
					open={active?.key === "EditInstallationDialog"}
					{...((active?.key === "EditInstallationDialog"
						? active.props
						: {}) as DialogMap["EditInstallationDialog"])}
				/>
			)}
			{active?.key === "EditServerDialog" && (
				<EditServerDialog
					open={active?.key === "EditServerDialog"}
					{...((active?.key === "EditServerDialog"
						? active.props
						: {}) as DialogMap["EditServerDialog"])}
				/>
			)}
			{active?.key === "ImportInstallationDialog" && (
				<ImportInstallationDialog
					open={active?.key === "ImportInstallationDialog"}
				/>
			)}
			{active?.key === "RemoveModDialog" && (
				<RemoveModDialog
					open={active?.key === "RemoveModDialog"}
					{...((active?.key === "RemoveModDialog"
						? active.props
						: {}) as DialogMap["RemoveModDialog"])}
				/>
			)}
			{active?.key === "UpdateModDialog" && (
				<UpdateModDialog
					open={active?.key === "UpdateModDialog"}
					{...((active?.key === "UpdateModDialog"
						? active.props
						: {}) as DialogMap["UpdateModDialog"])}
				/>
			)}
		</React.Fragment>
	);
}
