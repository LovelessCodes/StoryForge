import { Lock, Pencil, Play, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useInstalledVersions } from "@/hooks/use-installed-versions";
import { useInstallations } from "@/stores/installations";
import { type Server, useServerStore } from "@/stores/servers";

interface ServerCardProps {
	server: Server;
	onConnect: (server: Server) => void;
	onUnfavorite: (server: Server) => void;
	onEdit: (server: Server) => void;
}

export function ServerCard({
	server,
	onConnect,
	onUnfavorite,
	onEdit,
}: ServerCardProps) {
	const serverAddress = server.port ? `${server.ip}:${server.port}` : server.ip;
	const hasPassword = server.password && server.password.length > 0;
	const { installations } = useInstallations();
	const { servers } = useServerStore();
	const installation = installations.find(
		(inst) => inst.id === server.installationId,
	);
	const { data: versions } = useInstalledVersions();
	if (!installation) return null;

	return (
		<div
			className={`flex items-center justify-between px-4 py-3 ${
				server.index !== servers.length - 1 ? "border-b border-border" : ""
			}`}
			key={server.id}
		>
			<div className="flex items-center gap-3">
				<div
					className={`h-2 w-2 rounded-full ${
						versions.includes(installation.version)
							? "bg-green-500"
							: "bg-muted-foreground/40"
					}`}
				/>
				<div>
					<p className="font-mono text-sm text-foreground">
						{server.name}
						{hasPassword ? (
							<Lock className="ml-2 inline h-4 w-4 text-muted-foreground" />
						) : null}
					</p>
					{installation.version && (
						<p className="font-mono text-xs text-muted-foreground">
							v{installation.version} - {serverAddress}
						</p>
					)}
				</div>
			</div>
			<div className="flex items-center gap-1">
				<Button
					className="h-8 w-8 text-muted-foreground hover:text-foreground"
					onClick={() => onConnect(server)}
					size="icon"
					variant="ghost"
				>
					<Play className="h-4 w-4" />
					<span className="sr-only">Play {server.name}</span>
				</Button>
				<Button
					className="h-8 w-8 text-muted-foreground hover:text-foreground"
					onClick={() => onEdit(server)}
					size="icon"
					variant="ghost"
				>
					<Pencil className="h-4 w-4" />
					<span className="sr-only">Edit {server.name}</span>
				</Button>
				<Button
					className="h-8 w-8"
					onClick={() => onUnfavorite(server)}
					size="icon"
					variant="ghost"
				>
					<Star
						className={`h-4 w-4 ${
							server.favorite
								? "fill-warning text-warning"
								: "text-muted-foreground hover:text-foreground"
						}`}
					/>
					<span className="sr-only">
						{server.favorite ? "Unfavorite" : "Favorite"} {server.name}
					</span>
				</Button>
			</div>
		</div>
	);
}
