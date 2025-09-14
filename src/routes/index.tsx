import { createFileRoute, useRouter } from "@tanstack/react-router";
import {
	CircleFadingPlusIcon,
	Download,
	FolderHeartIcon,
	FolderPlusIcon,
	Gamepad2,
	MapPinIcon,
	MapPinPlusIcon,
	ServerIcon,
} from "lucide-react";
import { InstallationCard } from "@/components/cards/installation.card";
import { ServerCard } from "@/components/cards/server.card";
import { VersionItem } from "@/components/items/version.item";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { useConnectToServer } from "@/hooks/use-connect-to-server";
import { useInstalledVersions } from "@/hooks/use-installed-versions";
import { usePlayInstallation } from "@/hooks/use-play-installation";
import { type Installation, useInstallations } from "@/stores/installations";
import { type Server, useServerStore } from "@/stores/servers";

export const Route = createFileRoute("/")({
	component: RouteComponent,
});

function RouteComponent() {
	return <Dashboard />;
}

function Dashboard() {
	const { installations, toggleFavorite: toggleFavoriteInstallation } =
		useInstallations();
	const { servers, toggleFavorite: toggleFavoriteServer } = useServerStore();
	const { data: versions } = useInstalledVersions();
	const router = useRouter();
	const { mutate: connectToServer } = useConnectToServer();
	const { mutate: playWithInstallation } = usePlayInstallation();

	const handleEditInstallation = (installation: Installation) => {
		console.log("Editing installation:", installation.name);
	};

	const handleEditServer = (server: Server) => {
		console.log("Editing server:", server.name);
	};

	return (
		<div className="min-h-screen w-full bg-background">
			{/* Header */}
			<header className="border-b bg-card">
				<div className="container mx-auto px-6 py-4">
					<div className="flex items-center justify-between">
						<div className="flex items-center gap-3">
							<div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center">
								<Gamepad2 className="w-6 h-6 text-primary-foreground" />
							</div>
							<div>
								<h1 className="text-2xl font-bold">Story Forge</h1>
								<p className="text-sm text-muted-foreground">
									Manage your installations, servers, and mods
								</p>
							</div>
						</div>
					</div>
				</div>
			</header>

			{/* Main Content */}
			<main className="container mx-auto px-6 py-8 space-y-8">
				{/* Favorited Installations */}
				<section>
					<div className="flex items-center gap-2 mb-6">
						<FolderHeartIcon className="w-5 h-5 text-primary" />
						<h2 className="text-xl font-bold">Favorited Installations</h2>
						<span className="text-sm text-muted-foreground">
							({installations.filter((i) => i.favorite).length})
						</span>
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									onClick={() =>
										router.navigate({
											to: "/installations",
											viewTransition: { types: ["warp"] },
										})
									}
									size="icon"
									variant="outline"
								>
									<FolderPlusIcon className="size-4" />
								</Button>
							</TooltipTrigger>
							<TooltipContent>Manage Installations</TooltipContent>
						</Tooltip>
					</div>

					{installations.filter((i) => i.favorite).length > 0 ? (
						<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
							{installations
								.filter((i) => i.favorite)
								.map((installation) => (
									<InstallationCard
										installation={installation}
										key={installation.id}
										onAddMods={(i) =>
											router.navigate({
												params: { id: i.id.toString() },
												to: "/install-mods/$id",
												viewTransition: { types: ["warp"] },
											})
										}
										onEdit={handleEditInstallation}
										onPlay={(i) => playWithInstallation({ id: i.id })}
										onUnfavorite={(i) => toggleFavoriteInstallation(i.id)}
									/>
								))}
						</div>
					) : (
						<Card>
							<CardContent className="py-8 text-center">
								<FolderHeartIcon className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
								<p className="text-muted-foreground">
									No favorited installations yet
								</p>
							</CardContent>
						</Card>
					)}
				</section>

				{/* Favorited Servers */}
				<section>
					<div className="flex items-center gap-2 mb-6">
						<MapPinIcon className="w-5 h-5 text-primary" />
						<h2 className="text-xl font-bold">Favorited Servers</h2>
						<span className="text-sm text-muted-foreground">
							({servers.filter((s) => s.favorite).length})
						</span>
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									onClick={() =>
										router.navigate({
											to: "/servers",
											viewTransition: { types: ["warp"] },
										})
									}
									size="icon"
									variant="outline"
								>
									<MapPinPlusIcon className="size-4" />
								</Button>
							</TooltipTrigger>
							<TooltipContent>Manage Servers</TooltipContent>
						</Tooltip>
					</div>

					{servers.filter((s) => s.favorite).length > 0 ? (
						<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
							{servers
								.filter((s) => s.favorite)
								.map((server) => (
									<ServerCard
										key={server.id}
										onConnect={(s) =>
											connectToServer({
												installationId: s.installationId,
												ip: s.ip,
												password: s.password,
											})
										}
										onEdit={handleEditServer}
										onUnfavorite={(s) => toggleFavoriteServer(s.id)}
										server={server}
									/>
								))}
						</div>
					) : (
						<Card>
							<CardContent className="py-8 text-center">
								<ServerIcon className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
								<p className="text-muted-foreground">
									No favorited servers yet
								</p>
							</CardContent>
						</Card>
					)}
				</section>

				{/* Installed Versions */}
				<section>
					<div className="flex items-center gap-2 mb-6">
						<Download className="w-5 h-5 text-primary" />
						<h2 className="text-xl font-bold">Installed Versions</h2>
						<span className="text-sm text-muted-foreground">
							({versions.length})
						</span>
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									onClick={() =>
										router.navigate({
											to: "/versions",
											viewTransition: { types: ["warp"] },
										})
									}
									size="icon"
									variant="outline"
								>
									<CircleFadingPlusIcon className="size-4" />
								</Button>
							</TooltipTrigger>
							<TooltipContent>Manage Versions</TooltipContent>
						</Tooltip>
					</div>

					<Card>
						<CardHeader>
							<CardTitle>Game Versions</CardTitle>
						</CardHeader>
						<CardContent>
							{versions.length > 0 ? (
								<div className="space-y-2">
									{versions.map((version) => (
										<VersionItem key={version} version={version} />
									))}
								</div>
							) : (
								<div className="py-8 text-center">
									<Download className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
									<p className="text-muted-foreground">No versions installed</p>
								</div>
							)}
						</CardContent>
					</Card>
				</section>
			</main>
		</div>
	);
}
