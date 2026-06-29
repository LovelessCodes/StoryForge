import { Link, useMatches } from "@tanstack/react-router";
import {
  CheckIcon,
  CircleFadingPlusIcon,
  CogIcon,
  EarthIcon,
  FolderIcon,
  GlobeIcon,
  HardDriveIcon,
  HomeIcon,
  MapPinIcon,
  NewspaperIcon,
  PackageIcon,
  RefreshCcwIcon,
  UserMinus2,
  UserPlus2,
  ZapIcon,
} from "lucide-react";
import { toast } from "sonner";

import { AuthStatus } from "@/components/auth/auth-status";
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
import { rootDialogHandle, rootMenuHandle, rootTooltipHandle } from "@/handles";
import { useHostedServers } from "@/hooks/queries/server-hosting";
import { useAppVersion } from "@/hooks/use-app-version";
import { useInstalledVersions } from "@/hooks/use-installed-versions";
import { useModpacks } from "@/hooks/use-modpacks";
import { useSaves } from "@/hooks/use-saves";
import { useVerifyAuth } from "@/hooks/use-verify-auth";
import { useAccountStore } from "@/stores/accounts";
import { useDownloadStore } from "@/stores/downloads";
import { useInstallations } from "@/stores/installations";
import { useServerStore } from "@/stores/servers";

import { ModConfigsButton } from "./buttons/mod-configs.button";
import { ModsButton } from "./buttons/mods.button";

export function AppSidebar() {
  const matches = useMatches();
  const { selectedUser, users, removeUser, setSelectedUser } = useAccountStore();
  const { installations } = useInstallations();
  const { data: hostedInstances } = useHostedServers();
  const { data: appVersion } = useAppVersion();
  const { data: saves } = useSaves();
  const { data: installedVersions } = useInstalledVersions();
  const { data: modpacks } = useModpacks();
  const downloadEntries = useDownloadStore((s) => s.entries);
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
        <div className="flex min-w-0 items-center gap-2 p-2 select-none">
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
            className="w-full justify-start ps-1"
            render={<Button variant="ghost" />}
            handle={rootMenuHandle}
            payload={() => (
              <>
                {users.map((user) => (
                  <Group className="w-full" key={`${user.uid}-${user.email}-user`}>
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
            className="w-full justify-between"
            render={<DialogTrigger handle={rootDialogHandle} payload={() => <AddUserDialog />} />}
            variant="ghost"
          >
            <UserPlus2 className="size-4" />
            <span className="flex text-xs in-data-[state=collapsed]:hidden">Sign in</span>
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
                {matches.some((m) => m.fullPath.includes("installations/$id/mods")) && (
                  <ModsButton />
                )}
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
                    to="/mods"
                  />
                }
              >
                <PackageIcon />
                Mods
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                render={
                  <Link
                    activeProps={{
                      "data-active": true,
                    }}
                    to="/modpacks"
                  />
                }
              >
                <ZapIcon />
                Modpacks
                <SidebarMenuBadge className="text-xs">{modpacks?.totalCount ?? 0}</SidebarMenuBadge>
              </SidebarMenuButton>
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
                        to="/server-hosting"
                      />
                    }
                    size="sm"
                  >
                    <HardDriveIcon />
                    Hosting
                    <SidebarMenuBadge className="text-xs">
                      {hostedInstances?.length ?? 0}
                    </SidebarMenuBadge>
                  </SidebarMenuSubButton>
                </SidebarMenuSubItem>
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
                {(() => {
                  const activeCount = Object.values(downloadEntries).filter(
                    (e) => e.status !== "done",
                  ).length;
                  const installedCount = installedVersions?.length ?? 0;
                  if (activeCount > 0) return `${installedCount}+${activeCount}`;
                  return installedCount;
                })()}
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
        <AuthStatus />
        <Link to="/settings">
          <button
            className="group/button bg-sidebar relative w-full cursor-pointer overflow-hidden p-2 px-6 text-center font-semibold in-data-[state='collapsed']:px-2"
            type="button"
          >
            <div className="flex items-center justify-center gap-2">
              <div className="bg-foreground absolute size-2 opacity-0 transition-all duration-300 group-hover/button:scale-[100.8] group-hover/button:opacity-100" />
              <div className="bg-primary absolute size-2 opacity-0 transition-all duration-300 group-hover/button:scale-[100.8] group-hover/button:opacity-100 in-data-[state='collapsed']:hidden"></div>
              <CogIcon className="inline-block size-4 transition-all duration-300 group-hover/button:translate-x-12 group-hover/button:opacity-0" />
            </div>
            <div className="text-primary-foreground absolute top-0 z-10 flex h-full w-full translate-x-12 items-center justify-center gap-2 opacity-0 transition-all duration-300 group-hover/button:-translate-x-5 group-hover/button:opacity-100 in-data-[state='collapsed']:group-hover/button:-translate-x-2">
              <span className="in-data-[state='collapsed']:hidden">Settings</span>
              <CogIcon className="inline-block size-4" />
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
              <div className="absolute size-2 bg-[#5865F2] opacity-0 transition-all duration-300 group-hover/button:scale-[100.8] group-hover/button:opacity-100" />
              <svg
                className="inline-block size-4 transition-all duration-300 group-hover/button:translate-x-12 group-hover/button:opacity-0"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <title>Discord</title>
                <path
                  d="M20.32 4.37a19.79 19.79 0 00-4.89-1.52.07.07 0 00-.08.04c-.21.38-.44.86-.61 1.25-1.84-.28-3.68-.28-5.49 0-.16-.39-.41-.87-.62-1.25a.08.08 0 00-.08-.04 19.74 19.74 0 00-4.89 1.52.07.07 0 00-.03.03C.53 9.05-.32 13.58.10 18.06a.08.08 0 00.03.06c2.05 1.51 4.04 2.42 5.99 3.03a.08.08 0 00.08-.03c.46-.63.87-1.30 1.23-1.99a.08.08 0 00-.04-.11c-.65-.25-1.27-.55-1.87-.89a.08.08 0 01-.01-.13c.13-.09.25-.19.37-.29a.07.07 0 01.08-.01c3.93 1.79 8.18 1.79 12.06 0a.07.07 0 01.08.01c.12.10.25.20.37.29a.08.08 0 01-.01.13 12.3 12.3 0 01-1.87.89.08.08 0 00-.04.11c.36.70.77 1.36 1.23 1.99a.08.08 0 00.08.03c1.96-.61 3.95-1.52 6.00-3.03a.08.08 0 00.03-.06c.50-5.18-.84-9.67-3.55-13.66a.06.06 0 00-.03-.03zM8.02 15.33c-1.18 0-2.16-1.09-2.16-2.42 0-1.33.96-2.42 2.16-2.42 1.21 0 2.18 1.10 2.16 2.42 0 1.33-.96 2.42-2.16 2.42zm7.97 0c-1.18 0-2.16-1.09-2.16-2.42 0-1.33.96-2.42 2.16-2.42 1.21 0 2.18 1.10 2.16 2.42 0 1.33-.95 2.42-2.16 2.42Z"
                  fill="currentColor"
                />
              </svg>
            </div>
            <div className="text-primary-foreground absolute top-0 z-10 flex h-full w-full translate-x-12 items-center justify-center gap-2 opacity-0 transition-all duration-300 group-hover/button:-translate-x-5 group-hover/button:opacity-100 in-data-[state='collapsed']:group-hover/button:-translate-x-2">
              <span className="in-data-[state='collapsed']:hidden">Discord</span>
              <svg className="size-4" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <title>Discord</title>
                <path
                  d="M20.32 4.37a19.79 19.79 0 00-4.89-1.52.07.07 0 00-.08.04c-.21.38-.44.86-.61 1.25-1.84-.28-3.68-.28-5.49 0-.16-.39-.41-.87-.62-1.25a.08.08 0 00-.08-.04 19.74 19.74 0 00-4.89 1.52.07.07 0 00-.03.03C.53 9.05-.32 13.58.10 18.06a.08.08 0 00.03.06c2.05 1.51 4.04 2.42 5.99 3.03a.08.08 0 00.08-.03c.46-.63.87-1.30 1.23-1.99a.08.08 0 00-.04-.11c-.65-.25-1.27-.55-1.87-.89a.08.08 0 01-.01-.13c.13-.09.25-.19.37-.29a.07.07 0 01.08-.01c3.93 1.79 8.18 1.79 12.06 0a.07.07 0 01.08.01c.12.10.25.20.37.29a.08.08 0 01-.01.13 12.3 12.3 0 01-1.87.89.08.08 0 00-.04.11c.36.70.77 1.36 1.23 1.99a.08.08 0 00.08.03c1.96-.61 3.95-1.52 6.00-3.03a.08.08 0 00.03-.06c.50-5.18-.84-9.67-3.55-13.66a.06.06 0 00-.03-.03zM8.02 15.33c-1.18 0-2.16-1.09-2.16-2.42 0-1.33.96-2.42 2.16-2.42 1.21 0 2.18 1.10 2.16 2.42 0 1.33-.96 2.42-2.16 2.42zm7.97 0c-1.18 0-2.16-1.09-2.16-2.42 0-1.33.96-2.42 2.16-2.42 1.21 0 2.18 1.10 2.16 2.42 0 1.33-.95 2.42-2.16 2.42Z"
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
