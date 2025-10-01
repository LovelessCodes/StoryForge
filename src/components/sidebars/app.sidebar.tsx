import { Link } from "@tanstack/react-router";
import { invoke } from "@tauri-apps/api/core";
import {
	CheckIcon,
	CircleFadingPlusIcon,
	EarthIcon,
	FolderIcon,
	GlobeIcon,
	HomeIcon,
	MapPinIcon,
	NewspaperIcon,
	PlayIcon,
	RefreshCcwIcon,
	UserMinus2,
	UserPlus2,
} from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuBadge,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarMenuSub,
	SidebarMenuSubButton,
	SidebarMenuSubItem,
} from "@/components/ui/sidebar";
import { useInstalledVersions } from "@/hooks/use-installed-versions";
import { useVerifyAuth } from "@/hooks/use-verify-auth";
import { useAccountStore } from "@/stores/accounts";
import { useDialogStore } from "@/stores/dialogs";
import { useInstallations } from "@/stores/installations";
import { useServerStore } from "@/stores/servers";
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
	const { data: installedVersions } = useInstalledVersions();
	const { servers } = useServerStore();
	const { openDialog } = useDialogStore();
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
								<Button
									className="w-full justify-between"
									onClick={() => openDialog("AddUserDialog")}
									variant="outline"
								>
									<span className="flex text-xs">Sign in</span>
									<UserPlus2 className="size-4" />
								</Button>
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
							<Button
								className="w-full justify-between rounded-t-none"
								onClick={() => openDialog("AddUserDialog")}
								variant="outline"
							>
								<span className="flex text-xs">Add user</span>
								<UserPlus2 className="size-4" />
							</Button>
						</DropdownMenuContent>
					</DropdownMenu>
				) : (
					<Button
						className="w-full justify-between"
						onClick={() => openDialog("AddUserDialog")}
						variant="outline"
					>
						<span className="flex text-xs">Sign in</span>
						<UserPlus2 className="size-4" />
					</Button>
				)}
			</SidebarHeader>
			<SidebarContent>
				<SidebarGroup>
					<SidebarMenu>
						<SidebarMenuItem>
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
						</SidebarMenuItem>
						<SidebarMenuItem>
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
							<SidebarMenuBadge className="text-xs text-muted-foreground">
								{installations.length}
							</SidebarMenuBadge>
							<SidebarMenuSub>
								<SidebarMenuSubItem>
									<SidebarMenuSubButton asChild>
										<Link
											activeProps={{
												className: "bg-accent text-accent-foreground",
											}}
											to="/worlds"
											viewTransition={{ types: ["warp"] }}
										>
											<EarthIcon />
											Worlds
										</Link>
									</SidebarMenuSubButton>
								</SidebarMenuSubItem>
							</SidebarMenuSub>
						</SidebarMenuItem>
						<SidebarMenuItem>
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
							<SidebarMenuBadge className="text-xs text-muted-foreground">
								{servers.length}
							</SidebarMenuBadge>
							<SidebarMenuSub>
								<SidebarMenuSubItem>
									<SidebarMenuSubButton asChild>
										<Link
											activeProps={{
												className: "bg-accent text-accent-foreground",
											}}
											to="/public-servers"
											viewTransition={{ types: ["warp"] }}
										>
											<GlobeIcon />
											Public
										</Link>
									</SidebarMenuSubButton>
								</SidebarMenuSubItem>
							</SidebarMenuSub>
						</SidebarMenuItem>
						<SidebarMenuItem>
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
							<SidebarMenuBadge className="text-xs text-muted-foreground">
								{installedVersions?.length}
							</SidebarMenuBadge>
						</SidebarMenuItem>
						<SidebarMenuItem>
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
						</SidebarMenuItem>
					</SidebarMenu>
				</SidebarGroup>
			</SidebarContent>
			<SidebarFooter>
				<a
					className="w-full"
					href="https://discord.gg/gByx63peUC"
					rel="noreferrer"
					target="_blank"
				>
					<button
						className="group/button relative w-auto cursor-pointer overflow-hidden rounded-md border bg-background p-2 px-6 text-center font-semibold w-full"
						type="button"
					>
						<div className="flex items-center justify-center gap-2">
							<div className="h-2 w-2 rounded-full bg-[#5865F2] transition-all duration-300 absolute opacity-0 group-hover/button:opacity-100 group-hover/button:scale-[100.8]"></div>
							<svg
								className="w-4 h-4 inline-block transition-all duration-300 group-hover/button:translate-x-12 group-hover/button:opacity-0"
								role="img"
								viewBox="0 0 24 24"
								xmlns="http://www.w3.org/2000/svg"
							>
								<title>Discord</title>
								<path
									d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z"
									fill="currentColor"
								/>
							</svg>
						</div>
						<div className="absolute top-0 z-10 flex h-full w-full translate-x-12 items-center justify-center gap-2 text-primary-foreground opacity-0 transition-all duration-300 group-hover/button:-translate-x-5 group-hover/button:opacity-100">
							<span>Discord</span>
							<svg
								className="w-4 h-4"
								role="img"
								viewBox="0 0 24 24"
								xmlns="http://www.w3.org/2000/svg"
							>
								<title>Discord</title>
								<path
									d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z"
									fill="currentColor"
								/>
							</svg>
						</div>
					</button>
				</a>
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
