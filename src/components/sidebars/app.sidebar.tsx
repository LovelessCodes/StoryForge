import { Link } from "@tanstack/react-router";
import { invoke } from "@tauri-apps/api/core";
import {
	CheckIcon,
	CircleFadingPlusIcon,
	EarthIcon,
	FolderIcon,
	HomeIcon,
	MapPinIcon,
	NewspaperIcon,
	PlayIcon,
	RefreshCcwIcon,
	UserMinus2,
} from "lucide-react";
import { toast } from "sonner";
import { AddUserDialog } from "@/components/dialogs/adduser.dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuButton,
} from "@/components/ui/sidebar";
import { useVerifyAuth } from "@/hooks/use-verify-auth";
import { useAccountStore } from "@/stores/accounts";
import { useInstallations } from "@/stores/installations";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";

export function AppSidebar() {
	const { selectedUser, users, removeUser, setSelectedUser } =
		useAccountStore();
	const { installations } = useInstallations();
	const { mutate: verifyAuth } = useVerifyAuth({
		onError: (error, variables) => {
			toast.error(
				`Error verifying auth for ${users.find((user) => user.uid === variables.uid)?.playername}: ${error.message}`,
				{
					id: `verify-auth-${variables.uid}`,
				},
			);
		},
		onMutate: (variables) => {
			toast.loading(
				`Verifying auth for ${users.find((user) => user.uid === variables.uid)?.playername}...`,
				{ id: `verify-auth-${variables.uid}` },
			);
		},
		onSuccess: (data, variables) => {
			if (data.valid) {
				toast.success(
					`Auth is valid for ${users.find((user) => user.uid === variables.uid)?.playername}`,
					{ id: `verify-auth-${variables.uid}` },
				);
			} else {
				toast.error(
					`Auth is NOT valid for ${users.find((user) => user.uid === variables.uid)?.playername}`,
					{ id: `verify-auth-${variables.uid}` },
				);
			}
		},
	});
	return (
		<Sidebar>
			<SidebarHeader>
				{selectedUser ? (
					<DropdownMenu>
						<DropdownMenuTrigger className="w-full">
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
						</DropdownMenuTrigger>
						<DropdownMenuContent align="start" side="right">
							{users.map((user) => (
								<div
									className="flex items-center justify-between group"
									key={user.uid}
								>
									<Button
										className="flex items-center gap-2 rounded-none group-first:rounded-tl-md"
										onClick={() => setSelectedUser(user.uid)}
										onKeyUp={(e) => {
											if (e.key === "Enter") setSelectedUser(user.uid);
										}}
										variant="outline"
									>
										<Avatar className="w-6 h-6">
											<AvatarImage src="./placeholder.png" />
											<AvatarFallback>
												{user.playername?.charAt(0)}
											</AvatarFallback>
										</Avatar>
										<span className="font-medium">{user.playername}</span>
										{user.uid === selectedUser.uid && (
											<CheckIcon className="size-4 text-muted-foreground opacity-50" />
										)}
									</Button>
									<Tooltip>
										<TooltipTrigger asChild>
											<Button
												className="flex items-center justify-center hover:text-green-900 p-1 rounded-none"
												onClick={() => {
													verifyAuth({
														sessionkey: user.sessionkey || "",
														uid: user.uid || "",
													});
												}}
												onKeyUp={(e) => {
													if (e.key === "Enter") {
														verifyAuth({
															sessionkey: user.sessionkey || "",
															uid: user.uid || "",
														});
													}
												}}
												size="icon"
												variant="outline"
											>
												<RefreshCcwIcon />
											</Button>
										</TooltipTrigger>
										<TooltipContent>
											Verify {user.playername}&#39;s auth
										</TooltipContent>
									</Tooltip>
									<Tooltip>
										<TooltipTrigger asChild>
											<Button
												className="flex items-center justify-center hover:text-red-900 p-1 rounded-none group-first:rounded-tr-md"
												onClick={() => {
													removeUser(user.uid);
												}}
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
										</TooltipTrigger>
										<TooltipContent>Remove {user.playername}</TooltipContent>
									</Tooltip>
								</div>
							))}
							<AddUserDialog />
						</DropdownMenuContent>
					</DropdownMenu>
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
