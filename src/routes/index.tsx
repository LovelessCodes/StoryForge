import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import {
	FolderHeartIcon,
	FolderIcon,
	FolderPlusIcon,
	MapPinIcon,
	MapPinPlusIcon,
	ServerIcon,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { InstallationCard } from "@/components/cards/installation.card";
import { ServerCard } from "@/components/cards/server.card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ErrorComponent } from "@/components/ui/error";
import { useAppVersion } from "@/hooks/use-app-version";
import { useConnectToServer } from "@/hooks/use-connect-to-server";
import { usePlayInstallation } from "@/hooks/use-play-installation";
import { useDialogStore } from "@/stores/dialogs";
import { useInstallations } from "@/stores/installations";
import { useServerStore } from "@/stores/servers";

export const Route = createFileRoute("/")({
	component: RouteComponent,
	errorComponent: ErrorComponent,
});

function RouteComponent() {
	return <Dashboard />;
}

function Dashboard() {
	const { installations, toggleFavorite: toggleFavoriteInstallation } =
		useInstallations();
	const { servers, toggleFavorite: toggleFavoriteServer } = useServerStore();
	const { data: appVersion } = useAppVersion();
	const router = useRouter();
	const { mutate: connectToServer } = useConnectToServer();
	const { mutate: playWithInstallation } = usePlayInstallation();
	const { openDialog } = useDialogStore();

	return (
		<div className="h-screen w-full grid grid-rows-[min-content] overflow-hidden bg-background">
			{/* Header */}
			<header className="border-b bg-card sticky top-0 z-10 h-fit">
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
			<main className="px-6 py-6 space-y-8 h-full overflow-y-auto">
				<section className="flex gap-6 h-full">
					{/* Installations */}
					<div className="flex flex-col w-full h-full relative overflow-y-auto">
						{installations.length > 0 ? (
							<div className="flex flex-col w-full bg-card rounded-lg shadow border">
								<AnimatePresence>
									<Link className="sticky top-0" to="/installations">
										<Button
											className="text-center text-sm rounded-b-none relative text-muted-foreground w-full hover:text-foreground group"
											variant="secondary"
										>
											<Badge
												className="absolute top-2 left-2 group-hover:text-foreground text-muted-foreground"
												variant="outline"
											>
												{installations.length}
											</Badge>
											Installations
											<FolderIcon className="inline size-3 ml-2" />
										</Button>
									</Link>
									{[...installations]
										.sort((a, b) => {
											if (a.favorite === b.favorite) {
												return a.index - b.index;
											}
											return a.favorite ? -1 : 1;
										})
										.map((installation, index) => (
											<motion.div
												animate={{ opacity: 1, y: 0 }}
												className="flex items-center justify-between px-4 py-3 not-last:border-b"
												exit={{ opacity: 0, y: -12 }}
												initial={{ opacity: 0, y: 12 }}
												key={installation.id}
												layout
												transition={{
													damping: 32,
													delay: index * 0.05, // 50ms incremental stagger based on current index
													stiffness: 420,
													type: "spring" as const,
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
								<Button
									className="text-center sticky bottom-0 text-sm text-muted-foreground rounded-t-none w-full"
									onClick={() => openDialog("AddInstallationDialog")}
									variant="secondary"
								>
									Add Installation
									<FolderPlusIcon className="size-3 ml-2" />
								</Button>
							</div>
						) : (
							<div className="flex flex-col w-full gap-6  bg-card p-4 rounded shadow border">
								<FolderHeartIcon className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
								<p className="text-muted-foreground">No installations yet</p>
								<Button
									className="text-center text-sm text-muted-foreground w-full"
									onClick={() => openDialog("AddInstallationDialog")}
									variant="secondary"
								>
									Add Installation
									<FolderPlusIcon className="size-3 ml-2" />
								</Button>
							</div>
						)}
					</div>
					<div className="flex flex-col w-full">
						{servers.length > 0 ? (
							<div className="flex flex-col h-fit overflow-y-auto relative bg-card rounded-lg shadow border">
								<Link className="sticky top-0" to="/servers">
									<Button
										className="text-center text-sm rounded-b-none relative text-muted-foreground w-full hover:text-foreground group"
										variant="secondary"
									>
										<Badge
											className="absolute top-2 left-2 group-hover:text-foreground text-muted-foreground"
											variant="outline"
										>
											{servers.length}
										</Badge>
										Servers
										<MapPinIcon className="inline size-3 ml-2" />
									</Button>
								</Link>
								<AnimatePresence>
									{[...servers]
										.sort((a, b) => {
											if (a.favorite === b.favorite) {
												return a.index - b.index;
											}
											return a.favorite ? -1 : 1;
										})
										.map((server, index) => (
											<motion.div
												animate={{ opacity: 1, y: 0 }}
												className="not-last:border-b flex items-center justify-between px-4 py-3"
												exit={{ opacity: 0, y: -12 }}
												initial={{ opacity: 0, y: 12 }}
												key={server.id}
												layout
												transition={{
													damping: 32,
													delay: index * 0.05, // 50ms incremental stagger based on current index
													stiffness: 420,
													type: "spring" as const,
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
								<Button
									className="text-center text-sm sticky bottom-0 text-muted-foreground rounded-t-none w-full"
									onClick={() => openDialog("AddServerDialog")}
									variant="secondary"
								>
									Add Server
									<MapPinPlusIcon className="size-3 mr-2" />
								</Button>
							</div>
						) : (
							<div className="flex flex-col w-full gap-6  bg-card p-4 rounded shadow border">
								<ServerIcon className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
								<p className="text-muted-foreground">No servers yet</p>
								<Button
									className="text-center text-sm text-muted-foreground w-full"
									onClick={() => openDialog("AddServerDialog")}
									variant="secondary"
								>
									Add Server
									<MapPinPlusIcon className="size-3 ml-2" />
								</Button>
							</div>
						)}
					</div>
				</section>
			</main>
		</div>
	);
}
