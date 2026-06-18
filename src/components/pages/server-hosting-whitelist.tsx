import { Trash2Icon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  useWhitelist,
  useServerStatus,
  useAddToWhitelist,
  useRemoveFromWhitelist,
  useSetWhitelistMode,
  useSendCommand,
} from "@/hooks/queries/server-hosting";
import { useAccountStore } from "@/stores/accounts";

import { Input } from "../ui/input";
import { ScrollArea } from "../ui/scroll-area";

type Props = {
  instanceId: number;
};

export function ServerHostingWhitelist({ instanceId }: Props) {
  const [lookupName, setLookupName] = useState("");
  const [newUid, setNewUid] = useState("");
  const [newName, setNewName] = useState("");

  const { data, isLoading } = useWhitelist(instanceId);
  const { data: statusData } = useServerStatus(instanceId);
  const addMutation = useAddToWhitelist();
  const removeMutation = useRemoveFromWhitelist();
  const toggleMutation = useSetWhitelistMode();
  const sendCommand = useSendCommand();
  const { selectedUser } = useAccountStore();

  const status = statusData?.status;
  const isRunning = status === "running";
  const isBusy = status === "starting" || status === "stopping";

  const entries = data?.entries ?? [];
  const whitelistEnabled = data?.whitelistEnabled ?? true;

  const handleLookup = async () => {
    if (!lookupName.trim()) return;
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const result = await invoke<{ uid: string; name: string } | null>("lookup_player_uid", {
        accountName: lookupName.trim(),
      });
      if (result) {
        setNewUid(result.uid);
        setNewName(result.name);
        toast.success(`Found: ${result.name} (UID: ${result.uid})`);
      } else {
        toast.error(`Player "${lookupName}" not found`);
      }
    } catch (e) {
      toast.error(`Lookup failed: ${String(e)}`);
    }
  };

  const handleAddMe = () => {
    if (selectedUser?.uid && selectedUser?.playername) {
      setNewUid(selectedUser.uid);
      setNewName(selectedUser.playername);
    }
  };

  return (
    <ScrollArea scrollFade>
      <div className="flex flex-col gap-4">
        {isLoading ? (
          <p className="text-muted-foreground py-8 text-center text-sm">Loading whitelist…</p>
        ) : (
          <>
            {entries.length === 0 ? (
              <p className="text-muted-foreground py-4 text-center text-sm">
                No players in the whitelist.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Player</TableHead>
                    <TableHead>UID</TableHead>
                    <TableHead>Added By</TableHead>
                    <TableHead className="w-[80px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((entry) => (
                    <TableRow key={entry.uid}>
                      <TableCell className="font-medium">{entry.name}</TableCell>
                      <TableCell className="text-muted-foreground font-mono text-sm">
                        {entry.uid}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {entry.added_by ?? "unknown"}
                      </TableCell>
                      <TableCell>
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          disabled={removeMutation.isPending}
                          onClick={() => {
                            if (
                              !confirm(`Remove player ${entry.name || entry.uid} from whitelist?`)
                            )
                              return;
                            removeMutation.mutate(
                              { id: instanceId, uid: entry.uid },
                              {
                                onSuccess: (_, { uid }) => {
                                  if (isRunning) {
                                    sendCommand.mutate(
                                      {
                                        id: instanceId,
                                        command: `/whitelist remove ${entry.name || uid}`,
                                      },
                                      {
                                        onSuccess: () =>
                                          toast.success(
                                            `Sent whitelist remove command for ${entry.name || uid}`,
                                          ),
                                        onError: () =>
                                          toast.warning(
                                            "Player removed from file but live command failed (server may not be responding)",
                                          ),
                                      },
                                    );
                                  }
                                },
                              },
                            );
                          }}
                        >
                          <Trash2Icon className="size-3 text-red-500" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}

            {/* Whitelist toggle */}
            <div className="bg-muted/30 flex items-center justify-between border p-3">
              <div>
                <p className="text-sm font-medium">Whitelist</p>
                <p className="text-muted-foreground text-xs">
                  {whitelistEnabled
                    ? "Enabled — only whitelisted players can join"
                    : "Disabled — anyone can join"}
                </p>
              </div>
              <Button
                disabled={isBusy || toggleMutation.isPending}
                onClick={() =>
                  toggleMutation.mutate({ id: instanceId, enabled: !whitelistEnabled })
                }
                size="sm"
                variant={whitelistEnabled ? "default" : "outline"}
              >
                {whitelistEnabled ? "Disable" : "Enable"}
              </Button>
            </div>

            {/* Add player form */}
            <div className="bg-muted/30 border p-4">
              <p className="mb-3 text-sm font-medium">Add Player</p>

              <div className="flex gap-2">
                <Input
                  onChange={(e) => setLookupName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void handleLookup();
                  }}
                  size="sm"
                  placeholder="Vintage Story account name"
                  value={lookupName}
                />
                <Button
                  disabled={!lookupName.trim()}
                  onClick={handleLookup}
                  size="sm"
                  variant="outline"
                >
                  Look up UID
                </Button>
              </div>

              <p className="text-muted-foreground my-2 text-center text-xs">
                — or enter manually —
              </p>

              <div className="grid grid-cols-2 gap-2">
                <Input
                  onChange={(e) => setNewUid(e.target.value)}
                  placeholder="Player UID"
                  value={newUid}
                />
                <Input
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Player name (label)"
                  value={newName}
                />
              </div>

              <div className="mt-3 flex gap-2">
                {selectedUser?.uid && (
                  <Button onClick={handleAddMe} size="sm" type="button" variant="outline">
                    + Add me
                  </Button>
                )}
                <Button
                  disabled={!newUid.trim() || addMutation.isPending}
                  onClick={() =>
                    addMutation.mutate(
                      {
                        id: instanceId,
                        uid: newUid.trim(),
                        name: newName.trim() || newUid,
                      },
                      {
                        onSuccess: (entry) => {
                          setNewUid("");
                          setNewName("");
                          setLookupName("");
                          if (isRunning) {
                            sendCommand.mutate(
                              { id: instanceId, command: `/whitelist add ${entry.name}` },
                              {
                                onSuccess: () =>
                                  toast.success(`Sent whitelist add command for ${entry.name}`),
                                onError: () =>
                                  toast.warning(
                                    "Player added to file but live command failed (server may not be responding)",
                                  ),
                              },
                            );
                          }
                        },
                      },
                    )
                  }
                  size="sm"
                >
                  {addMutation.isPending ? "Adding…" : "Add"}
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </ScrollArea>
  );
}
