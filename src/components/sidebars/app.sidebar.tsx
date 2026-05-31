import { Link, useMatches } from "@tanstack/react-router";
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

import { AddUserDialog } from "@/components/dialogs/adduser.dialog";
import { Logo } from "@/components/logo";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { DialogTrigger } from "@/components/ui/dialog";
import { Group, GroupSeparator } from "@/components/ui/group";
import { MenuTrigger } from "@/components/ui/menu";
import { Separator } from "@/components/ui/separator";
import {
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
import { TooltipTrigger } from "@/components/ui/tooltip";
import { useAppVersion } from "@/hooks/use-app-version";
import { useInstalledVersions } from "@/hooks/use-installed-versions";
import { useSaves } from "@/hooks/use-saves";
import { useVerifyAuth } from "@/hooks/use-verify-auth";
import { rootDialogHandle, rootMenuHandle, rootTooltipHandle } from "@/routes/__root";
import { useAccountStore } from "@/stores/accounts";
import { useInstallations } from "@/stores/installations";
import { useServerStore } from "@/stores/servers";

import { ModConfigsButton } from "./buttons/mod-configs.button";
import { ModsButton } from "./buttons/mods.button";

export function AppSidebar() {
  const matches = useMatches();
  const { selectedUser, users, removeUser, setSelectedUser } = useAccountStore();
  const { installations } = useInstallations();
  const { data: appVersion } = useAppVersion();
  const { data: saves } = useSaves();
  const { data: installedVersions } = useInstalledVersions();
  const { servers } = useServerStore();
  const { mutate: verifyAuth } = useVerifyAuth({
    onError: (error, variables) => {
      removeUser(variables.uid);
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
        removeUser(variables.uid);
        toast.error(
          `Auth is NOT valid for ${users.find((user) => user.uid === variables.uid)?.playername}`,
          { id: `verify-auth-${variables.uid}` },
        );
      }
    },
  });
  return (
    <>
      <SidebarHeader>
        <div className="flex min-w-0 items-center gap-2 px-2 py-2 select-none">
          <Logo className="size-6" monoChrome />
          <p
            data-tauri-drag-region
            className="text-foreground truncate font-bold in-data-[state=collapsed]:hidden"
          >
            Story Forge{" "}
            <a
              className="text-muted-foreground text-xs font-normal hover:underline"
              href={`https://github.com/lovelesscodes/storyforge/releases/storyforge-v${appVersion}`}
              rel="noreferrer"
              target="_blank"
            >
              (v{appVersion})
            </a>
          </p>
        </div>
        {selectedUser ? (
          <MenuTrigger
            className="w-full justify-start rounded-none ps-1"
            render={<Button variant="ghost" />}
            handle={rootMenuHandle}
            payload={() => (
              <>
                {users.map((user) => (
                  <Group className="w-full rounded-none" key={`${user.uid}-${user.email}-user`}>
                    <Button
                      className="flex h-8 flex-1 items-center justify-start gap-2"
                      onClick={() => setSelectedUser(user.uid)}
                      onKeyUp={(e) => {
                        if (e.key === "Enter") setSelectedUser(user.uid);
                      }}
                      variant="ghost"
                    >
                      <Avatar className="size-5">
                        <AvatarImage src="./placeholder.png" />
                        <AvatarFallback>{user.playername?.charAt(0)}</AvatarFallback>
                      </Avatar>
                      <span className="font-medium">{user.playername}</span>
                      {user.uid === selectedUser.uid && (
                        <CheckIcon className="text-muted-foreground size-4 opacity-50" />
                      )}
                    </Button>
                    <GroupSeparator />
                    <TooltipTrigger
                      render={
                        <Button
                          className="hover:text-success flex items-center justify-center p-1"
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
                          variant="ghost"
                        >
                          <RefreshCcwIcon />
                        </Button>
                      }
                      handle={rootTooltipHandle}
                      payload={() => `Verify ${user.playername}'s auth`}
                    />
                    <GroupSeparator />
                    <TooltipTrigger
                      render={
                        <Button
                          className="flex items-center justify-center p-1 hover:text-red-900"
                          onClick={() => {
                            removeUser(user.uid);
                          }}
                          onKeyUp={(e) => {
                            if (e.key === "Enter") {
                              removeUser(user.uid);
                            }
                          }}
                          size="icon"
                          variant="destructive-ghost"
                        >
                          <UserMinus2 />
                        </Button>
                      }
                      handle={rootTooltipHandle}
                      payload={() => `Remove ${user.playername}`}
                    />
                  </Group>
                ))}
                <Separator />
                <Button
                  className="w-full justify-between"
                  render={
                    <DialogTrigger handle={rootDialogHandle} payload={() => <AddUserDialog />} />
                  }
                  variant="ghost"
                >
                  <span className="flex text-xs">Add user</span>
                  <UserPlus2 className="size-4" />
                </Button>
              </>
            )}
          >
            <div className="flex items-center gap-2">
              <Avatar className="size-6">
                <AvatarImage src="./placeholder.png" />
                <AvatarFallback>{selectedUser.playername?.charAt(0)}</AvatarFallback>
              </Avatar>
              <span className="font-medium in-data-[state=collapsed]:hidden">
                {selectedUser.playername}
              </span>
            </div>
          </MenuTrigger>
        ) : (
          <Button
            className="w-full justify-between rounded-none"
            render={<DialogTrigger handle={rootDialogHandle} payload={() => <AddUserDialog />} />}
            variant="ghost"
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
                      "data-active": true,
                    }}
                    to="/"
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
                      "data-active": true,
                    }}
                    to="/installations"
                  />
                }
              >
                <FolderIcon />
                Installations
              </SidebarMenuButton>
              <SidebarMenuBadge className="text-muted-foreground text-xs">
                {installations.length}
              </SidebarMenuBadge>
              <SidebarMenuSub>
                {matches.some((m) => m.fullPath.includes("install-mods")) && <ModsButton />}
                {matches.some((m) => m.fullPath.includes("mod-configs")) && <ModConfigsButton />}
                <SidebarMenuSubItem>
                  <SidebarMenuSubButton
                    render={
                      <Link
                        activeProps={{
                          "data-active": true,
                        }}
                        to="/worlds"
                      />
                    }
                    size="sm"
                  >
                    <EarthIcon />
                    Worlds
                    <SidebarMenuBadge className="text-xs">{saves?.length ?? 0}</SidebarMenuBadge>
                  </SidebarMenuSubButton>
                </SidebarMenuSubItem>
              </SidebarMenuSub>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                render={
                  <Link
                    activeProps={{
                      "data-active": true,
                    }}
                    to="/servers"
                  />
                }
              >
                <MapPinIcon />
                Servers
              </SidebarMenuButton>
              <SidebarMenuBadge className="text-muted-foreground text-xs">
                {servers.length}
              </SidebarMenuBadge>
              <SidebarMenuSub>
                <SidebarMenuSubItem>
                  <SidebarMenuSubButton
                    render={
                      <Link
                        activeProps={{
                          "data-active": true,
                        }}
                        to="/public-servers"
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
                      "data-active": true,
                    }}
                    to="/versions"
                  />
                }
              >
                <CircleFadingPlusIcon />
                Versions
              </SidebarMenuButton>
              <SidebarMenuBadge className="text-muted-foreground text-xs">
                {installedVersions?.length}
              </SidebarMenuBadge>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                render={
                  <Link
                    activeProps={{
                      "data-active": true,
                    }}
                    to="/news"
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
        <Link to="/settings">
          <button
            className="group/button bg-sidebar relative w-full cursor-pointer overflow-hidden p-2 px-6 text-center font-semibold in-data-[state='collapsed']:px-2"
            type="button"
          >
            <div className="flex items-center justify-center gap-2">
              <div className="bg-foreground absolute h-2 w-2 opacity-0 transition-all duration-300 group-hover/button:scale-[100.8] group-hover/button:opacity-100" />
              <div className="bg-primary absolute h-2 w-2 opacity-0 transition-all duration-300 group-hover/button:scale-[100.8] group-hover/button:opacity-100 in-data-[state='collapsed']:hidden"></div>
              <CogIcon className="inline-block h-4 w-4 transition-all duration-300 group-hover/button:translate-x-12 group-hover/button:opacity-0" />
            </div>
            <div className="text-primary-foreground absolute top-0 z-10 flex h-full w-full translate-x-12 items-center justify-center gap-2 opacity-0 transition-all duration-300 group-hover/button:-translate-x-5 group-hover/button:opacity-100 in-data-[state='collapsed']:group-hover/button:-translate-x-2">
              <span className="in-data-[state='collapsed']:hidden">Settings</span>
              <CogIcon className="inline-block h-4 w-4" />
            </div>
          </button>
        </Link>
        <a className="w-full" href="https://discord.gg/gByx63peUC" rel="noreferrer" target="_blank">
          <button
            className="group/button bg-sidebar relative w-full cursor-pointer overflow-hidden p-2 px-6 text-center font-semibold in-data-[state='collapsed']:px-2"
            aria-label="Discord"
            type="button"
          >
            <div className="flex items-center justify-center gap-2">
              <div className="absolute h-2 w-2 bg-[#5865F2] opacity-0 transition-all duration-300 group-hover/button:scale-[100.8] group-hover/button:opacity-100" />
              <svg
                className="inline-block h-4 w-4 transition-all duration-300 group-hover/button:translate-x-12 group-hover/button:opacity-0"
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
            <div className="text-primary-foreground absolute top-0 z-10 flex h-full w-full translate-x-12 items-center justify-center gap-2 opacity-0 transition-all duration-300 group-hover/button:-translate-x-5 group-hover/button:opacity-100 in-data-[state='collapsed']:group-hover/button:-translate-x-2">
              <span className="in-data-[state='collapsed']:hidden">Discord</span>
              <svg className="h-4 w-4" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
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
    </>
  );
}
