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
import { SidebarFooterButton } from "@/components/buttons/sidebar-footer.button";
import { AddUserDialog } from "@/components/dialogs/adduser.dialog";
import { DiscordIcon } from "@/components/icons/discord";
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
  const servers = useServerStore((s) => s.servers);

  const { mutate: verifyAuth } = useVerifyAuth({
    onError: (error, variables) => {
      const playername = users.find((user) => user.uid === variables.uid)?.playername;
      // Only a rejected session may delete the saved account; network, HTTP
      // and parse failures keep it (same rule as the startup check).
      if ((error as { name?: string }).name === "invalid_session") {
        removeUser(variables.uid);
        toast.error(`Auth is NOT valid for ${playername}`, {
          id: `verify-auth-${variables.uid}`,
        });
      } else {
        toast.error(`Could not verify auth for ${playername}: ${error.message}`, {
          id: `verify-auth-${variables.uid}`,
        });
      }
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
          <SidebarFooterButton
            dotClassName="bg-foreground"
            expandedDotClassName="bg-primary"
            icon={CogIcon}
            label="Settings"
          />
        </Link>
        <a className="w-full" href="https://discord.gg/gByx63peUC" rel="noreferrer" target="_blank">
          <SidebarFooterButton
            aria-label="Discord"
            dotClassName="bg-[#5865F2]"
            icon={DiscordIcon}
            label="Discord"
          />
        </a>
      </SidebarFooter>
    </>
  );
}
