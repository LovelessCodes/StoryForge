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
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { useDownloadVersion } from "@/hooks/use-download-version";
import { useInstalledVersions } from "@/hooks/use-installed-versions";
import { usePlayInstallation } from "@/hooks/use-play-installation";
import { useRevealInFolder } from "@/hooks/use-reveal-in-folder";
import { cn, exportInstallation } from "@/lib/utils";
import { useDialogStore } from "@/stores/dialogs";
import { type Installation, useInstallations } from "@/stores/installations";

export type InstallationRowProps = {
	installation: Installation;
};

export function InstallationRow({ installation }: InstallationRowProps) {
	const router = useRouter();

	// Stores
	const { openDialog } = useDialogStore();
	const { toggleFavorite } = useInstallations();

	// Queries
	const { data: versions } = useInstalledVersions();
	const version = versions?.find((v) => v === installation.version);

	// Mutations
	const { mutate: downloadVersion, isPending: isInstalling } =
		useDownloadVersion();
	const { mutate: playWithInstallation } = usePlayInstallation();
	const { mutate: openFolder } = useRevealInFolder();

	return (
		<>
			<div className="flex items-center flex-1 gap-3">
				<Tooltip>
					<TooltipTrigger className="flex flex-col justify-start">
						<p className="text-sm text-foreground">{installation.name}</p>
						{installation.version && (
							<p className="text-xs text-muted-foreground">
								v{installation.version}
							</p>
						)}
					</TooltipTrigger>
					<TooltipContent>
						Last played:{" "}
						{installation.lastTimePlayed
							? formatDistanceToNow(new Date(installation.lastTimePlayed), {
									addSuffix: true,
								})
							: "Never"}
					</TooltipContent>
				</Tooltip>
			</div>
			<div className="inline-flex -space-x-px rounded-md shadow-xs rtl:space-x-reverse">
				<Tooltip>
					<TooltipTrigger asChild>
						{version ? (
							<Button
								className="rounded-none shadow-none first:rounded-s-md last:rounded-e-md focus-visible:z-10"
								onClick={() =>
									playWithInstallation({
										id: installation.id,
									})
								}
								variant="outline"
							>
								<PlayIcon
									aria-hidden="true"
									className="-ms-1 opacity-60 text-success"
									size={16}
								/>
							</Button>
						) : (
							<Button
								className="rounded-none shadow-none first:rounded-s-md last:rounded-e-md focus-visible:z-10"
								disabled={isInstalling}
								onClick={() => downloadVersion(installation.version)}
								variant="outline"
							>
								<DownloadCloudIcon
									aria-hidden="true"
									className="-ms-1 opacity-60 text-warning-foreground"
									size={16}
								/>
							</Button>
						)}
					</TooltipTrigger>
					<TooltipContent>
						{version ? "Launch" : `Download ${installation.version}`}
					</TooltipContent>
				</Tooltip>
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							className="rounded-none shadow-none first:rounded-s-md last:rounded-e-md focus-visible:z-10"
							onClick={() => toggleFavorite(installation.id)}
							variant="outline"
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
						</Button>
					</TooltipTrigger>
					<TooltipContent>
						{installation.favorite ? "Unfavorite" : "Favorite"}
					</TooltipContent>
				</Tooltip>
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							className="rounded-none shadow-none first:rounded-s-md last:rounded-e-md focus-visible:z-10"
							onClick={() =>
								router.navigate({
									params: { id: installation.id.toString() },
									to: "/install-mods/$id",
									viewTransition: {
										types: ["warp"],
									},
								})
							}
							variant="outline"
						>
							<PackageSearchIcon
								aria-hidden="true"
								className="-ms-1 opacity-60"
								size={16}
							/>
						</Button>
					</TooltipTrigger>
					<TooltipContent>Manage Mods</TooltipContent>
				</Tooltip>
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							className="rounded-none shadow-none first:rounded-s-md last:rounded-e-md focus-visible:z-10"
							onClick={() =>
								router.navigate({
									params: { id: installation.id.toString() },
									to: "/mod-configs/$id",
									viewTransition: {
										types: ["warp"],
									},
								})
							}
							variant="outline"
						>
							<PackageOpenIcon
								aria-hidden="true"
								className="-ms-1 opacity-60"
								size={16}
							/>
						</Button>
					</TooltipTrigger>
					<TooltipContent>Configure Mods</TooltipContent>
				</Tooltip>
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							aria-label="Open folder"
							className="rounded-none shadow-none first:rounded-s-md last:rounded-e-md focus-visible:z-10"
							onClick={() => openFolder(installation.path)}
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
							className="rounded-none shadow-none first:rounded-s-md last:rounded-e-md focus-visible:z-10"
							onClick={() => exportInstallation({ installation })}
							variant="outline"
						>
							<FileUpIcon
								aria-hidden="true"
								className="-ms-1 opacity-60"
								size={16}
							/>
						</Button>
					</TooltipTrigger>
					<TooltipContent>Export</TooltipContent>
				</Tooltip>
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							className="rounded-none shadow-none first:rounded-s-md last:rounded-e-md focus-visible:z-10"
							onClick={() =>
								openDialog("EditInstallationDialog", { installation })
							}
							variant="outline"
						>
							<PencilIcon
								aria-hidden="true"
								className="-ms-1 opacity-60"
								size={16}
							/>
						</Button>
					</TooltipTrigger>
					<TooltipContent>Edit</TooltipContent>
				</Tooltip>
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							aria-label="Delete"
							className="rounded-none shadow-none first:rounded-s-md last:rounded-e-md focus-visible:z-10"
							onClick={() =>
								openDialog("DeleteInstallationDialog", { installation })
							}
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
