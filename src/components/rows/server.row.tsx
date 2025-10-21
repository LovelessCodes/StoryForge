import {
	DownloadCloudIcon,
	PencilIcon,
	PlugIcon,
	StarIcon,
	TrashIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { useConnectToServer } from "@/hooks/use-connect-to-server";
import { useDownloadVersion } from "@/hooks/use-download-version";
import { useInstalledVersions } from "@/hooks/use-installed-versions";
import { cn } from "@/lib/utils";
import { useDialogStore } from "@/stores/dialogs";
import { useInstallations } from "@/stores/installations";
import { type Server, useServerStore } from "@/stores/servers";
import { useSettingsStore } from "@/stores/settings";

type ServerRowProps = {
	server: Server;
};

export function ServerRow({ server }: ServerRowProps) {
	// Stores
	const { openDialog } = useDialogStore();
	const { toggleFavorite } = useServerStore();
	const { streamMode } = useSettingsStore();
	const { data: versions } = useInstalledVersions();
	const { installations } = useInstallations();
	const installation = installations.find(
		(inst) => inst.id === server.installationId,
	);

	// Mutations
	const { mutate: connectToServer } = useConnectToServer();
	const { mutate: installVersion, isPending: isInstalling } =
		useDownloadVersion();

	return (
		<div className="flex items-center gap-2 py-2 px-2">
			<div className="flex flex-col flex-1">
				<p className="text-sm">{server.name}</p>
				<p className="text-xs text-muted-foreground">
					{streamMode ? (
						<span className="text-warning-foreground">hidden</span>
					) : (
						<span className="text-warning-foreground">
							{server.ip}
							{server.port ? `:${server.port}` : ""}
						</span>
					)}
					<span className="text-muted-foreground">
						{" "}
						via {installation?.name ?? "Unknown Installation"}
					</span>
				</p>
			</div>
			<div className="inline-flex -space-x-px rounded-md shadow-xs rtl:space-x-reverse">
				<Tooltip>
					<TooltipTrigger asChild>
						{versions?.includes(installation?.version ?? "") ? (
							<Button
								className="rounded-none shadow-none first:rounded-s-md last:rounded-e-md focus-visible:z-10"
								onClick={() =>
									connectToServer({
										installationId: server.installationId,
										ip: `${server.ip}${server.port ? `:${server.port}` : ""}`,
										name: server.name,
										password: server.password,
									})
								}
								variant="outline"
							>
								<PlugIcon
									aria-hidden="true"
									className="-ms-1 opacity-60 text-success"
									size={16}
								/>
							</Button>
						) : (
							<Button
								className="rounded-none shadow-none first:rounded-s-md last:rounded-e-md focus-visible:z-10"
								disabled={isInstalling}
								onClick={() => installVersion(installation?.version ?? "")}
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
						{versions?.includes(installation?.version ?? "")
							? "Connect"
							: `Install ${installation?.version ?? ""}`}
					</TooltipContent>
				</Tooltip>
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							className="rounded-none shadow-none first:rounded-s-md last:rounded-e-md focus-visible:z-10"
							onClick={() => toggleFavorite(server.id)}
							variant="outline"
						>
							<StarIcon
								aria-hidden="true"
								className={cn(
									"-ms-1",
									server.favorite
										? "fill-warning text-warning opacity-100"
										: "opacity-60",
								)}
								size={16}
							/>
						</Button>
					</TooltipTrigger>
					<TooltipContent>
						{server.favorite ? "Unfavorite" : "Favorite"}
					</TooltipContent>
				</Tooltip>
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							className="rounded-none shadow-none first:rounded-s-md last:rounded-e-md focus-visible:z-10"
							onClick={() => openDialog("EditServerDialog", { server })}
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
							onClick={() => openDialog("DeleteServerDialog", { server })}
							size="icon"
							variant="outline"
						>
							<TrashIcon aria-hidden="true" className="opacity-60" size={16} />
						</Button>
					</TooltipTrigger>
					<TooltipContent>Delete</TooltipContent>
				</Tooltip>
			</div>
		</div>
	);
}
