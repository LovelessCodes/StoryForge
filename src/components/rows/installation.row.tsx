import { useRouter } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";
import {
	DownloadCloudIcon,
	FileUpIcon,
	FolderOpenIcon,
	PackageOpenIcon,
	PackageSearchIcon,
	PencilIcon,
	PlayIcon,
	StarIcon,
	TrashIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Group, GroupItem, GroupSeparator } from "@/components/ui/group";
import {
	Tooltip,
	TooltipContent,
	TooltipCreateHandle,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { useDownloadVersion } from "@/hooks/use-download-version";
import { useExportInstallation } from "@/hooks/use-export-installation";
import { useInstalledVersions } from "@/hooks/use-installed-versions";
import { usePlayInstallation } from "@/hooks/use-play-installation";
import { useRevealInFolder } from "@/hooks/use-reveal-in-folder";
import { cn } from "@/lib/utils";
import { useDialogStore } from "@/stores/dialogs";
import { type Installation, useInstallations } from "@/stores/installations";

export type InstallationRowProps = {
	installation: Installation;
};

const tooltipHandle = TooltipCreateHandle();

export function InstallationRow({ installation }: InstallationRowProps) {
	const router = useRouter();

	// Stores
	const { openDialog } = useDialogStore();
	const { toggleFavorite } = useInstallations();

	// Queries
	const { data: versions } = useInstalledVersions();
	const version = versions?.find((v) => v === installation.version);
	const { exportToClipboard } = useExportInstallation(installation);

	// Mutations
	const { mutate: downloadVersion, isPending: isInstalling } =
		useDownloadVersion();
	const { mutate: playWithInstallation } = usePlayInstallation();
	const { mutate: openFolder } = useRevealInFolder();

	return (
		<>
			<div className="flex items-center flex-1 gap-3">
				<TooltipTrigger
					className="flex flex-col justify-start"
					handle={tooltipHandle}
					payload={() => (
						<>
							Last played:{" "}
							{installation.lastTimePlayed
								? formatDistanceToNow(new Date(installation.lastTimePlayed), {
										addSuffix: true,
									})
								: "Never"}
						</>
					)}
				>
					<p className="text-sm text-foreground">{installation.name}</p>
					{installation.version && (
						<p className="text-xs text-muted-foreground">
							v{installation.version}
						</p>
					)}
				</TooltipTrigger>
			</div>
			<Group>
				<TooltipTrigger
					handle={tooltipHandle}
					payload={() =>
						version ? "Launch" : `Install ${installation.version}`
					}
					render={
						<GroupItem
							render={
								<Button
									disabled={isInstalling}
									onClick={() =>
										version
											? playWithInstallation({
													id: installation.id,
												})
											: downloadVersion(installation.version)
									}
									size="icon"
									variant="outline"
								/>
							}
						>
							{version ? (
								<PlayIcon
									aria-hidden="true"
									className="-ms-1 opacity-60 text-success"
									size={16}
								/>
							) : (
								<DownloadCloudIcon
									aria-hidden="true"
									className="-ms-1 opacity-60 text-warning-foreground"
									size={16}
								/>
							)}
						</GroupItem>
					}
				/>
				<GroupSeparator />
				<TooltipTrigger
					handle={tooltipHandle}
					payload={() => (installation.favorite ? "Unfavorite" : "Favorite")}
					render={
						<GroupItem
							render={
								<Button
									onClick={() => toggleFavorite(installation.id)}
									size="icon"
									variant="outline"
								/>
							}
						>
							<StarIcon
								aria-hidden="true"
								className={cn(
									"-ms-1",
									installation.favorite
										? "fill-warning text-warning opacity-100"
										: "opacity-60",
								)}
								size={16}
							/>
						</GroupItem>
					}
				/>
				<GroupSeparator />
				<TooltipTrigger
					handle={tooltipHandle}
					payload={() => "Manage Mods"}
					render={
						<GroupItem
							render={
								<Button
									onClick={() =>
										router.navigate({
											params: { id: installation.id.toString() },
											to: "/install-mods/$id",
											viewTransition: {
												types: ["warp"],
											},
										})
									}
									size="icon"
									variant="outline"
								/>
							}
						>
							<PackageSearchIcon
								aria-hidden="true"
								className="-ms-1 opacity-60"
								size={16}
							/>
						</GroupItem>
					}
				/>
				<GroupSeparator />
				<TooltipTrigger
					handle={tooltipHandle}
					payload={() => "Configure Mods"}
					render={
						<GroupItem
							render={
								<Button
									onClick={() =>
										router.navigate({
											params: { id: installation.id.toString() },
											to: "/mod-configs/$id",
											viewTransition: {
												types: ["warp"],
											},
										})
									}
									size="icon"
									variant="outline"
								/>
							}
						>
							<PackageOpenIcon
								aria-hidden="true"
								className="-ms-1 opacity-60"
								size={16}
							/>
						</GroupItem>
					}
				/>
				<GroupSeparator />
				<TooltipTrigger
					handle={tooltipHandle}
					payload={() => "Open Folder"}
					render={
						<GroupItem
							render={
								<Button
									aria-label="Open folder"
									onClick={() => openFolder(installation.path)}
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
					payload={() => "Export Installation"}
					render={
						<GroupItem
							render={
								<Button
									onClick={() => exportToClipboard()}
									size="icon"
									variant="outline"
								/>
							}
						>
							<FileUpIcon
								aria-hidden="true"
								className="-ms-1 opacity-60"
								size={16}
							/>
						</GroupItem>
					}
				/>
				<GroupSeparator />
				<TooltipTrigger
					handle={tooltipHandle}
					payload={() => "Edit Installation"}
					render={
						<GroupItem
							render={
								<Button
									onClick={() =>
										openDialog("EditInstallationDialog", { installation })
									}
									size="icon"
									variant="outline"
								/>
							}
						>
							<PencilIcon
								aria-hidden="true"
								className="-ms-1 opacity-60"
								size={16}
							/>
						</GroupItem>
					}
				/>
				<GroupSeparator />
				<TooltipTrigger
					handle={tooltipHandle}
					payload={() => "Delete Installation"}
					render={
						<GroupItem
							render={
								<Button
									aria-label="Delete"
									onClick={() =>
										openDialog("DeleteInstallationDialog", { installation })
									}
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
