import { Link } from "@tanstack/react-router";
import {
	CheckIcon,
	CircleFadingPlusIcon,
	CogIcon,
	EarthIcon,
	FolderIcon,
	GlobeIcon,
	HomeIcon,
	MapPinIcon,
	NewspaperIcon,
	RefreshCcwIcon,
	UserMinus2,
	UserPlus2,
} from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Group, GroupItem, GroupSeparator } from "@/components/ui/group";
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
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { useInstalledVersions } from "@/hooks/use-installed-versions";
import { useSaves } from "@/hooks/use-saves";
import { useVerifyAuth } from "@/hooks/use-verify-auth";
import { useAccountStore } from "@/stores/accounts";
import { useDialogStore } from "@/stores/dialogs";
import { useInstallations } from "@/stores/installations";
import { useServerStore } from "@/stores/servers";
import { Menu, MenuPopup, MenuTrigger } from "../ui/menu";

export function AppSidebar() {
	const { selectedUser, users, removeUser, setSelectedUser } =
		useAccountStore();
	const { installations } = useInstallations();
	const { data: saves } = useSaves();
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
					<Menu>
						<MenuTrigger
							className="w-full"
							render={
								<Button
									onClick={() => !selectedUser && openDialog("AddUserDialog")}
									variant="outline"
								/>
							}
						>
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
								<>
									<span className="flex text-xs">Sign in</span>
									<UserPlus2 className="size-4" />
								</>
							)}
						</MenuTrigger>
						<MenuPopup align="start" side="right">
							{users.map((user) => (
								<Group
									className="rounded-none first:rounded-t-md last:rounded-b-md"
									key={user.uid}
								>
									<GroupItem
										render={
											<Button
												className="flex h-8 items-center gap-2"
												onClick={() => setSelectedUser(user.uid)}
												onKeyUp={(e) => {
													if (e.key === "Enter") setSelectedUser(user.uid);
												}}
												variant="outline"
											/>
										}
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
									</GroupItem>
									<GroupSeparator />
									<Tooltip>
										<TooltipTrigger
											render={
												<GroupItem
													render={
														<Button
															className="flex items-center justify-center hover:text-success p-1"
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
														/>
													}
												>
													<RefreshCcwIcon />
												</GroupItem>
											}
										/>
										<TooltipContent>
											Verify {user.playername}&#39;s auth
										</TooltipContent>
									</Tooltip>
									<GroupSeparator />
									<Tooltip>
										<TooltipTrigger
											render={
												<GroupItem
													render={
														<Button
															className="flex items-center justify-center hover:text-red-900 p-1"
															onClick={() => {
																removeUser(user.uid);
															}}
															onKeyUp={(e) => {
																if (e.key === "Enter") {
																	removeUser(user.uid);
																}
															}}
															size="icon"
															variant="destructive-outline"
														/>
													}
												>
													<UserMinus2 />
												</GroupItem>
											}
										/>
										<TooltipContent>Remove {user.playername}</TooltipContent>
									</Tooltip>
								</Group>
							))}
							<Button
								className="w-full justify-between mt-2"
								onClick={() => openDialog("AddUserDialog")}
								variant="outline"
							>
								<span className="flex text-xs">Add user</span>
								<UserPlus2 className="size-4" />
							</Button>
						</MenuPopup>
					</Menu>
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
							<SidebarMenuButton
								render={
									<Link
										activeProps={{
											className: "bg-accent text-accent-foreground",
										}}
										to="/"
										viewTransition={{ types: ["warp"] }}
									/>
								}
							>
								<HomeIcon />
								Home
							</SidebarMenuButton>
						</SidebarMenuItem>
						<SidebarMenuItem>
							<SidebarMenuButton
								render={
									<Link
										activeProps={{
											className: "bg-accent text-accent-foreground",
										}}
										to="/installations"
										viewTransition={{ types: ["warp"] }}
									/>
								}
							>
								<FolderIcon />
								Installations
							</SidebarMenuButton>
							<SidebarMenuBadge className="text-xs text-muted-foreground">
								{installations.length}
							</SidebarMenuBadge>
							<SidebarMenuSub>
								<SidebarMenuSubItem>
									<SidebarMenuSubButton
										render={
											<Link
												activeProps={{
													className: "bg-accent text-accent-foreground",
												}}
												to="/worlds"
												viewTransition={{ types: ["warp"] }}
											/>
										}
										size="sm"
									>
										<EarthIcon />
										Worlds
									</SidebarMenuSubButton>
									<SidebarMenuBadge className="text-xs text-muted-foreground">
										{saves?.length ?? 0}
									</SidebarMenuBadge>
								</SidebarMenuSubItem>
							</SidebarMenuSub>
						</SidebarMenuItem>
						<SidebarMenuItem>
							<SidebarMenuButton
								render={
									<Link
										activeProps={{
											className: "bg-accent text-accent-foreground",
										}}
										to="/servers"
										viewTransition={{ types: ["warp"] }}
									/>
								}
							>
								<MapPinIcon />
								Servers
							</SidebarMenuButton>
							<SidebarMenuBadge className="text-xs text-muted-foreground">
								{servers.length}
							</SidebarMenuBadge>
							<SidebarMenuSub>
								<SidebarMenuSubItem>
									<SidebarMenuSubButton
										render={
											<Link
												activeProps={{
													className: "bg-accent text-accent-foreground",
												}}
												to="/public-servers"
												viewTransition={{ types: ["warp"] }}
											/>
										}
										size="sm"
									>
										<GlobeIcon />
										Public
									</SidebarMenuSubButton>
								</SidebarMenuSubItem>
							</SidebarMenuSub>
						</SidebarMenuItem>
						<SidebarMenuItem>
							<SidebarMenuButton
								render={
									<Link
										activeProps={{
											className: "bg-accent text-accent-foreground",
										}}
										to="/versions"
										viewTransition={{ types: ["warp"] }}
									/>
								}
							>
								<CircleFadingPlusIcon />
								Versions
							</SidebarMenuButton>
							<SidebarMenuBadge className="text-xs text-muted-foreground">
								{installedVersions?.length}
							</SidebarMenuBadge>
						</SidebarMenuItem>
						<SidebarMenuItem>
							<SidebarMenuButton
								render={
									<Link
										activeProps={{
											className: "bg-accent text-accent-foreground",
										}}
										to="/news"
										viewTransition={{ types: ["warp"] }}
									/>
								}
							>
								<NewspaperIcon />
								News
							</SidebarMenuButton>
						</SidebarMenuItem>
					</SidebarMenu>
				</SidebarGroup>
			</SidebarContent>
			<SidebarFooter>
				<Link to="/settings" viewTransition={{ types: ["warp"] }}>
					<button
						className="group/button relative w-auto cursor-pointer overflow-hidden rounded-md border bg-background p-2 px-6 text-center font-semibold w-full"
						type="button"
					>
						<div className="flex items-center justify-center gap-2">
							<div className="h-2 w-2 rounded-full bg-primary transition-all duration-300 absolute opacity-0 group-hover/button:opacity-100 group-hover/button:scale-[100.8]"></div>
							<CogIcon className="w-4 h-4 inline-block transition-all duration-300 group-hover/button:translate-x-12 group-hover/button:opacity-0" />
						</div>
						<div className="absolute top-0 z-10 flex h-full w-full translate-x-12 items-center justify-center gap-2 text-primary-foreground opacity-0 transition-all duration-300 group-hover/button:-translate-x-5 group-hover/button:opacity-100">
							<span>Settings</span>
							<CogIcon className="w-4 h-4 inline-block" />
						</div>
					</button>
				</Link>
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
			</SidebarFooter>
		</Sidebar>
	);
}
