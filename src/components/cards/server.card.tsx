import { Heart, Lock, Settings, Wifi } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { useInstallations } from "@/stores/installations";
import type { Server } from "@/stores/servers";

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
	const installation = installations.find(
		(inst) => inst.id === server.installationId,
	);
	if (!installation) return null;

	return (
		<Card className="hover:shadow-lg transition-shadow">
			<CardHeader className="pb-3">
				<div className="flex items-start justify-between">
					<div className="flex items-center gap-3">
						<div className="w-12 h-12 rounded-lg bg-accent/10 flex items-center justify-center">
							<Wifi className="w-6 h-6 text-accent" />
						</div>
						<div>
							<CardTitle className="text-lg font-bold">{server.name}</CardTitle>
							<p className="text-sm text-muted-foreground font-mono">
								{serverAddress}
							</p>
						</div>
					</div>
					<Button
						className="text-destructive hover:text-destructive"
						onClick={() => onUnfavorite(server)}
						size="sm"
						variant="ghost"
					>
						<Heart className="w-4 h-4 fill-current" />
					</Button>
				</div>
			</CardHeader>
			<CardContent className="space-y-4">
				<div className="flex flex-col items-center gap-2">
					{hasPassword && (
						<Badge className="text-xs" variant="outline">
							<Lock className="w-3 h-3 mr-1" />
							Password Protected
						</Badge>
					)}
					<Badge className="text-xs" variant="secondary">
						Installation: {installation.name}
					</Badge>
				</div>

				<div className="flex gap-2">
					<Button className="flex-1" onClick={() => onConnect(server)}>
						<Wifi className="w-4 h-4 mr-2" />
						Connect
					</Button>
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								onClick={() => onEdit(server)}
								size="icon"
								variant="outline"
							>
								<Settings className="w-4 h-4" />
							</Button>
						</TooltipTrigger>
						<TooltipContent>Edit Server</TooltipContent>
					</Tooltip>
				</div>
			</CardContent>
		</Card>
	);
}
