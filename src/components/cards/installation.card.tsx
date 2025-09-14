import { Heart, Package, PackagePlusIcon, Play, Settings } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import type { Installation } from "@/stores/installations";

interface InstallationCardProps {
	installation: Installation;
	onPlay: (installation: Installation) => void;
	onUnfavorite: (installation: Installation) => void;
	onEdit: (installation: Installation) => void;
	onAddMods: (installation: Installation) => void;
}

function formatPlayTime(minutes: number): string {
	const hours = Math.floor(minutes / 60);
	const mins = minutes % 60;
	if (hours > 0) {
		return `${hours}h ${mins}m`;
	}
	return `${mins}m`;
}

function formatLastPlayed(timestamp: number): string {
	const date = new Date(timestamp);
	const now = new Date();
	const diffInDays = Math.floor(
		(now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24),
	);

	if (diffInDays === 0) return "Today";
	if (diffInDays === 1) return "Yesterday";
	if (diffInDays < 7) return `${diffInDays} days ago`;
	return date.toLocaleDateString();
}

export function InstallationCard({
	installation,
	onPlay,
	onUnfavorite,
	onEdit,
	onAddMods,
}: InstallationCardProps) {
	return (
		<Card className="hover:shadow-lg transition-shadow">
			<CardHeader className="pb-3">
				<div className="flex items-start justify-between">
					<div className="flex items-center gap-3">
						{installation.icon ? (
							<img
								alt={installation.name}
								className="w-12 h-12 rounded-lg object-cover"
								src={installation.icon || "/placeholder.svg"}
							/>
						) : (
							<div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center">
								<Package className="w-6 h-6 text-muted-foreground" />
							</div>
						)}
						<div>
							<CardTitle className="text-lg font-bold">
								{installation.name}
							</CardTitle>
							<Badge className="mt-1" variant="secondary">
								v{installation.version}
							</Badge>
						</div>
					</div>
					<Button
						className="text-destructive hover:text-destructive"
						onClick={() => onUnfavorite(installation)}
						size="sm"
						variant="ghost"
					>
						<Heart className="w-4 h-4 fill-current" />
					</Button>
				</div>
			</CardHeader>
			<CardContent className="space-y-4">
				<div className="grid grid-cols-2 gap-4 text-sm">
					<div>
						<p className="text-muted-foreground">Total Playtime</p>
						<p className="font-medium">
							{formatPlayTime(installation.totalTimePlayed)}
						</p>
					</div>
					<div>
						<p className="text-muted-foreground">Last Played</p>
						<p className="font-medium">
							{formatLastPlayed(installation.lastTimePlayed)}
						</p>
					</div>
				</div>

				<div className="flex gap-2">
					<Button className="flex-1" onClick={() => onPlay(installation)}>
						<Play className="w-4 h-4 mr-2" />
						Play
					</Button>
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								onClick={() => onEdit(installation)}
								size="icon"
								variant="outline"
							>
								<Settings className="w-4 h-4" />
							</Button>
						</TooltipTrigger>
						<TooltipContent>Edit Installation</TooltipContent>
					</Tooltip>
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								onClick={() => onAddMods(installation)}
								size="icon"
								variant="outline"
							>
								<PackagePlusIcon className="w-4 h-4" />
							</Button>
						</TooltipTrigger>
						<TooltipContent>Add Mods</TooltipContent>
					</Tooltip>
				</div>
			</CardContent>
		</Card>
	);
}
