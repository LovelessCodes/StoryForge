import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import {
	CircleFadingPlusIcon,
	Download,
	FolderHeartIcon,
	FolderPlusIcon,
	MapPinIcon,
	MapPinPlusIcon,
	ServerIcon,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
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
import { useAppVersion } from "@/hooks/use-app-version";
import { useConnectToServer } from "@/hooks/use-connect-to-server";
import { useInstalledVersions } from "@/hooks/use-installed-versions";
import { usePlayInstallation } from "@/hooks/use-play-installation";
import { useDialogStore } from "@/stores/dialogs";
import { useInstallations } from "@/stores/installations";
import { useServerStore } from "@/stores/servers";

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
	const { data: appVersion } = useAppVersion();
	const router = useRouter();
	const { mutate: connectToServer } = useConnectToServer();
	const { mutate: playWithInstallation } = usePlayInstallation();
	const { openDialog } = useDialogStore();

	return (
		<div className="h-screen w-full grid grid-rows-[min-content,1fr] bg-background">
			{/* Header */}
			<header className="border-b bg-card sticky top-0 z-10">
				<div className="container mx-auto px-6 py-4">
					<div className="flex items-center justify-between">
						<div className="flex items-center gap-3">
							<img
								alt="Story Forge"
								className="w-10 h-10"
								src="/StoryForge.png"
							/>
							<div>
								<h1 className="text-2xl font-bold">
									Story Forge{" "}
									<a
										className="text-muted-foreground text-xs font-normal hover:underline"
										href={`https://github.com/lovelesscodes/storyforge/releases/storyforge-v${appVersion}`}
										rel="noreferrer"
										target="_blank"
									>
										(v{appVersion})
									</a>
								</h1>
								<p className="text-sm text-muted-foreground">
									Manage your installations, servers, and mods
								</p>
							</div>
						</div>
					</div>
				</div>
			</header>

			{/* Main Content */}
			<main className="px-6 py-2 space-y-8 h-full overflow-y-auto">
				<section className="flex gap-6">
					{/* Installations */}
					<div className="flex flex-col w-full">
						<div className="flex items-center gap-2 mb-2">
							<FolderHeartIcon className="w-5 h-5 text-primary" />
							<h2 className="text-xl font-bold">Installations</h2>
							<span className="text-sm text-muted-foreground">
								({installations.length})
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

						{installations.length > 0 ? (
							<div className="flex flex-col w-full bg-card p-2 rounded shadow border">
								<AnimatePresence>
									{[...installations]
										.sort((a, b) => {
											if (a.favorite === b.favorite) {
												return a.index - b.index;
											}
											return a.favorite ? -1 : 1;
										})
										.slice(0, 5)
										.map((installation) => (
											<motion.div
												animate={{ opacity: 1, y: 0 }}
												className="flex items-center justify-between px-4 py-3 not-last:border-b"
												exit={{ opacity: 0, y: -12 }}
												initial={{ opacity: 0, y: 12 }}
												key={installation.id}
												layout
												transition={{
													damping: 38,
													mass: 0.9,
													stiffness: 420,
													type: "spring",
												}}
												whileTap={{ scale: 0.985 }}
											>
												<InstallationCard
													installation={installation}
													onAddMods={(i) =>
														router.navigate({
															params: { id: i.id.toString() },
															to: "/install-mods/$id",
															viewTransition: { types: ["warp"] },
														})
													}
													onEdit={(i) =>
														openDialog("EditInstallationDialog", {
															installation: i,
														})
													}
													onPlay={(i) => playWithInstallation({ id: i.id })}
													onUnfavorite={(i) => toggleFavoriteInstallation(i.id)}
												/>
											</motion.div>
										))}
								</AnimatePresence>
								{installations.length > 5 ? (
									<Link to="/installations">
										<Button
											className="text-center text-sm text-muted-foreground w-full"
											variant="outline"
										>
											And {installations.length - 5} more installation...
										</Button>
									</Link>
								) : null}
							</div>
						) : (
							<div className="flex flex-col w-full gap-6  bg-card p-4 rounded shadow border">
								<FolderHeartIcon className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
								<p className="text-muted-foreground">No installations yet</p>
							</div>
						)}
					</div>
					<div className="flex flex-col w-full">
						<div className="flex items-center gap-2 mb-2">
							<MapPinIcon className="w-5 h-5 text-primary" />
							<h2 className="text-xl font-bold">Servers</h2>
							<span className="text-sm text-muted-foreground">
								({servers.length})
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

						{servers.length > 0 ? (
							<div className="flex flex-col bg-card p-2 rounded shadow border">
								<AnimatePresence>
									{[...servers]
										.sort((a, b) => {
											if (a.favorite === b.favorite) {
												return a.index - b.index;
											}
											return a.favorite ? -1 : 1;
										})
										.slice(0, 5)
										.map((server) => (
											<motion.div
												animate={{ opacity: 1, y: 0 }}
												className="not-last:border-b flex items-center justify-between px-4 py-3"
												exit={{ opacity: 0, y: -12 }}
												initial={{ opacity: 0, y: 12 }}
												key={server.id}
												layout
												transition={{
													damping: 38,
													mass: 0.9,
													stiffness: 420,
													type: "spring",
												}}
												whileTap={{ scale: 0.985 }}
											>
												<ServerCard
													onConnect={(s) =>
														connectToServer({
															installationId: s.installationId,
															ip: `${s.ip}${s.port ? `:${s.port}` : ""}`,
															name: s.name,
															password: s.password,
														})
													}
													onEdit={(s) =>
														openDialog("EditServerDialog", { server: s })
													}
													onUnfavorite={(s) => toggleFavoriteServer(s.id)}
													server={server}
												/>
											</motion.div>
										))}
								</AnimatePresence>
								{servers.length > 5 ? (
									<Link to="/servers">
										<Button
											className="text-center text-sm text-muted-foreground w-full"
											variant="outline"
										>
											And {servers.length - 5} more server...
										</Button>
									</Link>
								) : null}
							</div>
						) : (
							<div className="flex flex-col w-full gap-6  bg-card p-4 rounded shadow border">
								<ServerIcon className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
								<p className="text-muted-foreground">No servers yet</p>
							</div>
						)}
					</div>
				</section>

				{/* Installed Versions */}
				<section>
					<div className="flex items-center gap-2 mb-2">
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
