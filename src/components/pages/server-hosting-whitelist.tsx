import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import { useAccountStore } from "@/stores/accounts";
import { useServerHostingStore } from "@/stores/server-hosting";

import { Input } from "../ui/input";
import { ScrollArea } from "../ui/scroll-area";

type Props = {
  instanceId: number;
};

export function ServerHostingWhitelist({ instanceId }: Props) {
  const queryClient = useQueryClient();
  const [lookupName, setLookupName] = useState("");
  const [newUid, setNewUid] = useState("");
  const [newName, setNewName] = useState("");
  const [lookupLoading, setLookupLoading] = useState(false);

  const {
    getWhitelist,
    addToWhitelist,
    removeFromWhitelist,
    lookupPlayerUid,
    sendCommand,
    setWhitelistMode,
    readServerConfig,
    runtimeStatuses,
  } = useServerHostingStore();
  const { selectedUser } = useAccountStore();

  const status = runtimeStatuses[instanceId]?.status;
  const isRunning = status === "running";
  const isBusy = status === "starting" || status === "stopping";

  const { data, isLoading } = useQuery({
    queryKey: ["whitelist", instanceId],
    queryFn: async () => {
      const [list, configJson] = await Promise.all([
        getWhitelist(instanceId),
        readServerConfig(instanceId),
      ]);
      let whitelistEnabled = true;
      try {
        const config = JSON.parse(configJson);
        whitelistEnabled = config.WhitelistMode !== 1;
      } catch {
        // config not valid JSON — leave default
      }
      return { entries: list, whitelistEnabled };
    },
    staleTime: 30_000,
  });

  const entries = data?.entries ?? [];
  const whitelistEnabled = data?.whitelistEnabled ?? true;

  const handleLookup = async () => {
    if (!lookupName.trim()) return;
    setLookupLoading(true);
    try {
      const result = await lookupPlayerUid(lookupName.trim());
      if (result) {
        setNewUid(result.uid);
        setNewName(result.name);
        toast.success(`Found: ${result.name} (UID: ${result.uid})`);
      } else {
        toast.error(`Player "${lookupName}" not found`);
      }
    } catch (e) {
      toast.error(`Lookup failed: ${String(e)}`);
    } finally {
      setLookupLoading(false);
    }
  };

  const addMutation = useMutation({
    mutationFn: async ({ uid, playerName }: { uid: string; playerName: string }) => {
      const entry = await addToWhitelist(instanceId, uid, playerName);
      return { entry, playerName };
    },
    onSuccess: ({ playerName }) => {
      void queryClient.invalidateQueries({ queryKey: ["whitelist", instanceId] });
      setNewUid("");
      setNewName("");
      setLookupName("");
      toast.success("Player added to whitelist");

      if (isRunning) {
        void sendCommand(instanceId, `/whitelist add ${playerName}`)
          .then(() => toast.success(`Sent whitelist add command for ${playerName}`))
          .catch(() =>
            toast.warning(
              "Player added to file but live command failed (server may not be responding)",
            ),
          );
      }
    },
    onError: (e) => {
      toast.error(`Failed to add: ${String(e)}`);
    },
  });

  const removeMutation = useMutation({
    mutationFn: async ({ uid, name }: { uid: string; name: string }) => {
      await removeFromWhitelist(instanceId, uid);
      return { uid, name };
    },
    onSuccess: ({ uid, name }) => {
      void queryClient.invalidateQueries({ queryKey: ["whitelist", instanceId] });
      toast.success("Player removed from whitelist");

      if (isRunning) {
        void sendCommand(instanceId, `/whitelist remove ${name || uid}`)
          .then(() => toast.success(`Sent whitelist remove command for ${name || uid}`))
          .catch(() =>
            toast.warning(
              "Player removed from file but live command failed (server may not be responding)",
            ),
          );
      }
    },
    onError: (e) => {
      toast.error(`Failed to remove: ${String(e)}`);
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async (newState: boolean) => {
      if (isRunning) {
        await sendCommand(instanceId, newState ? "/whitelist on" : "/whitelist off");
      } else {
        await setWhitelistMode(instanceId, newState);
      }
      return newState;
    },
    onSuccess: (newState) => {
      void queryClient.invalidateQueries({ queryKey: ["whitelist", instanceId] });
      toast.success(`Whitelist ${newState ? "enabled" : "disabled"}`);
    },
    onError: (e) => {
      toast.error(`Failed to toggle whitelist: ${String(e)}`);
    },
  });

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
                            removeMutation.mutate({ uid: entry.uid, name: entry.name });
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
                onClick={() => toggleMutation.mutate(!whitelistEnabled)}
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
                  disabled={!lookupName.trim() || lookupLoading}
                  onClick={handleLookup}
                  size="sm"
                  variant="outline"
                >
                  {lookupLoading ? "Looking up…" : "Look up UID"}
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
                    addMutation.mutate({ uid: newUid.trim(), playerName: newName.trim() || newUid })
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
