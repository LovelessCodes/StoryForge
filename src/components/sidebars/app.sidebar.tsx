import { Link } from "@tanstack/react-router";
import { invoke } from "@tauri-apps/api/core";
import {
	CircleFadingPlusIcon,
	EarthIcon,
	FolderIcon,
	HomeIcon,
	MapPinIcon,
	NewspaperIcon,
	PlayIcon,
	UserMinus2,
} from "lucide-react";
import { AddUserDialog } from "@/components/dialogs/adduser.dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
} from "@/components/ui/select";
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuButton,
} from "@/components/ui/sidebar";
import { useAccountStore } from "@/stores/accounts";
import { useInstallations } from "@/stores/installations";

export function AppSidebar() {
	const { selectedUser, users, removeUser, setSelectedUser } =
		useAccountStore();
	const { installations } = useInstallations();
	return (
		<Sidebar>
			<SidebarHeader>
				{selectedUser ? (
					<Select value={selectedUser?.uid ?? ""}>
						<SelectTrigger className="w-full">
							{selectedUser ? (
								<div className="flex items-center gap-2">
									<Avatar className="w-6 h-6">
										<AvatarImage src="./placeholder.png" />
										<AvatarFallback>
											{selectedUser.playername?.charAt(0)}
										</AvatarFallback>
									</Avatar>
									<span className="font-medium">{selectedUser.playername}</span>
								</div>
							) : (
								<AddUserDialog />
							)}
						</SelectTrigger>
						<SelectContent align="start" side="right">
							{users.map((user) => (
								<SelectItem
									key={user.uid}
									onSelect={() => setSelectedUser(user.uid)}
									value={user.uid ?? ""}
								>
									<div className="flex items-center gap-2">
										<Avatar className="w-6 h-6">
											<AvatarImage src="./placeholder.png" />
											<AvatarFallback>
												{selectedUser.playername?.charAt(0)}
											</AvatarFallback>
										</Avatar>
										<span className="font-medium">
											{selectedUser.playername}
										</span>
									</div>
									<Button
										className="flex items-center justify-center p-1 rounded-sm"
										onClick={() => removeUser(user.uid)}
										onKeyUp={(e) => {
											if (e.key === "Enter") {
												removeUser(user.uid);
											}
										}}
										size="icon"
										variant="outline"
									>
										<UserMinus2 />
									</Button>
								</SelectItem>
							))}
							<AddUserDialog />
						</SelectContent>
					</Select>
				) : (
					<AddUserDialog />
				)}
			</SidebarHeader>
			<SidebarContent>
				<SidebarGroup>
					<SidebarMenu>
						<SidebarMenuButton asChild>
							<Link
								activeProps={{
									className: "bg-accent text-accent-foreground",
								}}
								to="/"
								viewTransition={{ types: ["warp"] }}
							>
								<HomeIcon />
								Home
							</Link>
						</SidebarMenuButton>
						<SidebarMenuButton asChild>
							<Link
								activeProps={{
									className: "bg-accent text-accent-foreground",
								}}
								to="/news"
								viewTransition={{ types: ["warp"] }}
							>
								<NewspaperIcon />
								News
							</Link>
						</SidebarMenuButton>
						<SidebarMenuButton asChild>
							<Link
								activeProps={{
									className: "bg-accent text-accent-foreground",
								}}
								to="/installations"
								viewTransition={{ types: ["warp"] }}
							>
								<FolderIcon />
								Installations
							</Link>
						</SidebarMenuButton>
						<SidebarMenuButton asChild>
							<Link
								activeProps={{
									className: "bg-accent text-accent-foreground",
								}}
								to="/servers"
								viewTransition={{ types: ["warp"] }}
							>
								<MapPinIcon />
								Servers
							</Link>
						</SidebarMenuButton>
						<SidebarMenuButton asChild>
							<Link
								activeProps={{
									className: "bg-accent text-accent-foreground",
								}}
								to="/public-servers"
								viewTransition={{ types: ["warp"] }}
							>
								<EarthIcon />
								Public Servers
							</Link>
						</SidebarMenuButton>
						<SidebarMenuButton asChild>
							<Link
								activeProps={{
									className: "bg-accent text-accent-foreground",
								}}
								to="/versions"
								viewTransition={{ types: ["warp"] }}
							>
								<CircleFadingPlusIcon />
								Versions
							</Link>
						</SidebarMenuButton>
					</SidebarMenu>
				</SidebarGroup>
			</SidebarContent>
			<SidebarFooter>
				{installations.length > 0 && (
					<button
						className="group/button relative w-auto cursor-pointer overflow-hidden rounded-md border bg-background p-2 px-6 text-center font-semibold"
						onClick={() =>
							invoke("play_game", { installation_id: installations[0].id })
						}
						type="button"
					>
						<div className="flex items-center justify-center gap-2">
							<div className="h-2 w-2 rounded-full bg-green-200 transition-all duration-300 absolute opacity-0 group-hover/button:opacity-100 group-hover/button:scale-[100.8]"></div>
							<span className="inline-block transition-all duration-300 group-hover/button:translate-x-12 group-hover/button:opacity-0">
								Play Game
							</span>
						</div>
						<div className="absolute top-0 z-10 flex h-full w-full translate-x-12 items-center justify-center gap-2 text-primary-foreground opacity-0 transition-all duration-300 group-hover/button:-translate-x-5 group-hover/button:opacity-100">
							<span>Play Game</span>
							<PlayIcon className="size-4" />
						</div>
					</button>
				)}
			</SidebarFooter>
		</Sidebar>
	);
}
