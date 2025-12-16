import { DownloadCloudIcon, Lock, Pencil, Play, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Group, GroupItem } from "@/components/ui/group";
import {
	Tooltip,
	TooltipContent,
	TooltipCreateHandle,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { useDownloadVersion } from "@/hooks/use-download-version";
import { useInstalledVersions } from "@/hooks/use-installed-versions";
import { cn } from "@/lib/utils";
import { useInstallations } from "@/stores/installations";
import type { Server } from "@/stores/servers";
import { useSettingsStore } from "@/stores/settings";

interface ServerCardProps {
	server: Server;
	onConnect: (server: Server) => void;
	onUnfavorite: (server: Server) => void;
	onEdit: (server: Server) => void;
}

const tooltipHandle = TooltipCreateHandle();

export function ServerCard({
	server,
	onConnect,
	onUnfavorite,
	onEdit,
}: ServerCardProps) {
	const serverAddress = server.port ? `${server.ip}:${server.port}` : server.ip;
	const hasPassword = server.password && server.password.length > 0;
	const { installations } = useInstallations();
	const { streamMode } = useSettingsStore();
	const installation = installations.find(
		(inst) => inst.id === server.installationId,
	);
	const { data: versions } = useInstalledVersions();

	const { mutate: installVersion, isPending: isInstalling } =
		useDownloadVersion();
	if (!installation) return null;

	return (
		<>
			<div className="flex items-center gap-3">
				<div
					className={`h-2 w-2 rounded-full ${
						versions.includes(installation.version)
							? "bg-success"
							: "bg-muted-foreground/40"
					}`}
				/>
				<div className="text-left">
					<p className="font-mono text-sm text-foreground">
						{server.name}
						{hasPassword ? (
							<Lock className="ml-2 inline h-4 w-4 text-muted-foreground" />
						) : null}
					</p>
					{installation.version && (
						<p className="font-mono text-xs text-muted-foreground">
							v{installation.version} - {streamMode ? "hidden" : serverAddress}
						</p>
					)}
				</div>
			</div>
			<Group>
				<TooltipTrigger
					handle={tooltipHandle}
					payload={() =>
						versions.includes(installation.version)
							? `Connect to ${server.name}`
							: `Download version ${installation.version}`
					}
					render={
						<GroupItem
							render={
								<Button
									className="h-8 w-8 text-muted-foreground hover:text-foreground"
									disabled={isInstalling}
									onClick={() =>
										versions.includes(installation.version)
											? onConnect(server)
											: installVersion(installation.version)
									}
									size="icon"
									variant="ghost"
								/>
							}
						>
							{versions.includes(installation.version) ? (
								<>
									<Play className="h-4 w-4" />
									<span className="sr-only">Play {server.name}</span>
								</>
							) : (
								<>
									<DownloadCloudIcon className="h-4 w-4" />
									<span className="sr-only">
										Download version {installation.version}
									</span>
								</>
							)}
						</GroupItem>
					}
				/>
				<TooltipTrigger
					handle={tooltipHandle}
					payload={() => `Edit ${server.name}`}
					render={
						<GroupItem
							render={
								<Button
									className="h-8 w-8 text-muted-foreground hover:text-foreground"
									onClick={() => onEdit(server)}
									size="icon"
									variant="ghost"
								/>
							}
						>
							<Pencil className="h-4 w-4" />
							<span className="sr-only">Edit {server.name}</span>
						</GroupItem>
					}
				/>
				<TooltipTrigger
					handle={tooltipHandle}
					payload={() =>
						`${server.favorite ? "Unfavorite" : "Favorite"} ${server.name}`
					}
					render={
						<GroupItem
							render={
								<Button
									className={cn(
										"h-8 w-8",
										server.favorite
											? "text-warning"
											: "hover:text-foreground text-muted-foreground",
									)}
									onClick={() => onUnfavorite(server)}
									size="icon"
									variant="ghost"
								/>
							}
						>
							<Star
								className={cn("h-4 w-4", server.favorite && "fill-warning")}
							/>
							<span className="sr-only">
								{server.favorite ? "Unfavorite" : "Favorite"} {server.name}
							</span>
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
