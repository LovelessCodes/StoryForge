import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import {
  FolderHeartIcon,
  FolderIcon,
  FolderPlusIcon,
  MapPinIcon,
  MapPinPlusIcon,
  ServerIcon,
} from "lucide-react";
import { AnimatePresence } from "motion/react";

import { InstallationCard } from "@/components/cards/installation.card";
import { ServerCard } from "@/components/cards/server.card";
import { MotionInstallationContextMenu } from "@/components/context-menus/installation.context-menu";
import { MotionServerContextMenu } from "@/components/context-menus/server.context-menu";
import { AddInstallationDialog } from "@/components/dialogs/addinstallation.dialog";
import { AddServerDialog } from "@/components/dialogs/addserver.dialog";
import { EditInstallationDialog } from "@/components/dialogs/editinstallation.dialog";
import { EditServerDialog } from "@/components/dialogs/editserver.dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DialogTrigger } from "@/components/ui/dialog";
import { ErrorComponent } from "@/components/ui/error";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useConnectToServer } from "@/hooks/use-connect-to-server";
import { usePlayInstallation } from "@/hooks/use-play-installation";
import { sortInstallations } from "@/lib/utils";
import { useInstallations } from "@/stores/installations";
import { useServerStore } from "@/stores/servers";

import { rootDialogHandle } from "./__root";

export const Route = createFileRoute("/")({
  component: RouteComponent,
  errorComponent: ErrorComponent,
});

function RouteComponent() {
  return <Dashboard />;
}

function Dashboard() {
  const { installations, toggleFavorite: toggleFavoriteInstallation } = useInstallations();
  const { servers, toggleFavorite: toggleFavoriteServer } = useServerStore();
  const router = useRouter();
  const { mutate: connectToServer } = useConnectToServer();
  const { mutate: playWithInstallation } = usePlayInstallation();

  return (
    <main className="h-full space-y-8 px-2 pt-1 pb-2 max-md:pt-8">
      <section className="flex h-full gap-6">
        {/* Installations */}
        <div className="flex w-full flex-col">
          {installations.length > 0 ? (
            <>
              <Link to="/installations">
                <Button
                  className="text-muted-foreground hover:text-foreground group relative w-full text-center text-sm"
                  variant="outline"
                >
                  <Badge
                    className="group-hover:text-foreground text-muted-foreground absolute top-1.5 left-1.5"
                    variant="outline"
                  >
                    {installations.length}
                  </Badge>
                  Installations
                  <FolderIcon className="ml-2 inline size-3" />
                </Button>
              </Link>
              <ScrollArea className="border-input h-full border-x" scrollFade>
                <AnimatePresence>
                  {installations.sort(sortInstallations).map((installation, index) => (
                    <MotionInstallationContextMenu
                      animate={{ opacity: 1, y: 0 }}
                      className="flex items-center justify-between px-4 py-3 not-last:border-b"
                      exit={{ opacity: 0, y: -12 }}
                      initial={{ opacity: 0, y: 12 }}
                      installation={installation}
                      key={`${installation.id}-installation-context-menu`}
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
                          })
                        }
                        onEdit={(i) =>
                          rootDialogHandle.openWithPayload(() => (
                            <EditInstallationDialog installation={i} />
                          ))
                        }
                        onPlay={(i) => playWithInstallation({ id: i.id })}
                        onUnfavorite={(i) => toggleFavoriteInstallation(i.id)}
                      />
                    </MotionInstallationContextMenu>
                  ))}
                </AnimatePresence>
              </ScrollArea>
              <Button
                className="text-muted-foreground w-full text-center text-sm"
                render={
                  <DialogTrigger
                    handle={rootDialogHandle}
                    payload={() => <AddInstallationDialog />}
                  />
                }
                variant="outline"
              >
                Add Installation
                <FolderPlusIcon className="ml-2 size-3" />
              </Button>
            </>
          ) : (
            <div className="bg-card flex w-full flex-col gap-6 border p-4 shadow">
              <FolderHeartIcon className="text-muted-foreground mx-auto mb-4 h-12 w-12" />
              <p className="text-muted-foreground">No installations yet</p>
              <Button
                className="text-muted-foreground w-full text-center text-sm"
                render={
                  <DialogTrigger
                    handle={rootDialogHandle}
                    payload={() => <AddInstallationDialog />}
                  />
                }
                variant="secondary"
              >
                Add Installation
                <FolderPlusIcon className="ml-2 size-3" />
              </Button>
            </div>
          )}
        </div>
        <div className="flex w-full flex-col">
          {servers.length > 0 ? (
            <>
              <Link to="/servers">
                <Button
                  className="text-muted-foreground hover:text-foreground group relative w-full text-center text-sm"
                  variant="outline"
                >
                  <Badge
                    className="group-hover:text-foreground text-muted-foreground absolute top-1.5 left-1.5"
                    variant="outline"
                  >
                    {servers.length}
                  </Badge>
                  Servers
                  <MapPinIcon className="ml-2 inline size-3" />
                </Button>
              </Link>
              <ScrollArea scrollFade className="border-input h-full border-x">
                <AnimatePresence>
                  {servers
                    .sort((a, b) => {
                      if (a.favorite === b.favorite) {
                        return a.index - b.index;
                      }
                      return a.favorite ? -1 : 1;
                    })
                    .map((server, index) => (
                      <MotionServerContextMenu
                        animate={{ opacity: 1, y: 0 }}
                        className="flex items-center justify-between px-4 py-3 not-last:border-b"
                        exit={{ opacity: 0, y: -12 }}
                        initial={{ opacity: 0, y: 12 }}
                        key={`${server.id}-${server.installationId}-server-context-menu`}
                        layout
                        server={server}
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
                            rootDialogHandle.openWithPayload(() => <EditServerDialog server={s} />)
                          }
                          onUnfavorite={(s) => toggleFavoriteServer(s.id)}
                          server={server}
                        />
                      </MotionServerContextMenu>
                    ))}
                </AnimatePresence>
              </ScrollArea>
              <Button
                className="text-muted-foreground sticky bottom-0 w-full text-center text-sm"
                render={
                  <DialogTrigger handle={rootDialogHandle} payload={() => <AddServerDialog />} />
                }
                variant="outline"
              >
                Add Server
                <MapPinPlusIcon className="mr-2 size-3" />
              </Button>
            </>
          ) : (
            <div className="bg-card flex w-full flex-col gap-6 border p-4 shadow">
              <ServerIcon className="text-muted-foreground mx-auto mb-4 h-12 w-12" />
              <p className="text-muted-foreground">No servers yet</p>
              <Button
                className="text-muted-foreground w-full text-center text-sm"
                render={
                  <DialogTrigger handle={rootDialogHandle} payload={() => <AddServerDialog />} />
                }
                variant="secondary"
              >
                Add Server
                <MapPinPlusIcon className="ml-2 size-3" />
              </Button>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
