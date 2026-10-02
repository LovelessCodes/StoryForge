import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { Loader2, Search } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { useCreateInstance } from "@/hooks/queries/server-hosting";
import { useInstalledVersionNames } from "@/hooks/use-installed-versions";
import { compareSemverDesc } from "@/lib/helpers";
import { toast } from "@/lib/notify";
import { gameVersionsQuery } from "@/lib/queries";
import { useAccountStore } from "@/stores/accounts";

interface CreateHostedServerSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function CreateHostedServerSheet({
  open,
  onOpenChange,
}: CreateHostedServerSheetProps) {
  const createInstance = useCreateInstance();
  const { data: gameVersions } = useQuery(gameVersionsQuery);
  const installedVersions = useInstalledVersionNames();
  const installedVersionsSet = new Set(installedVersions);
  const { selectedUser } = useAccountStore();

  const allVersions = (gameVersions ?? []).toSorted(compareSemverDesc);

  const [name, setName] = useState("");
  const [version, setVersion] = useState("");
  const [port, setPort] = useState("42420");
  const [bindIp, setBindIp] = useState("0.0.0.0");
  const [dataDir, setDataDir] = useState("");
  const [startParams, setStartParams] = useState("");
  const [password, setPassword] = useState("");
  const [whitelistEnabled, setWhitelistEnabled] = useState(false);
  const [defaultWhitelistUid, setDefaultWhitelistUid] = useState("");
  const [defaultWhitelistName, setDefaultWhitelistName] = useState("");
  const [lookupInput, setLookupInput] = useState("");
  const [lookingUp, setLookingUp] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedVersion = version || allVersions[0] || "";

  function reset() {
    setName("");
    setVersion("");
    setPort("42420");
    setBindIp("0.0.0.0");
    setDataDir("");
    setStartParams("");
    setPassword("");
    setWhitelistEnabled(false);
    setDefaultWhitelistUid("");
    setDefaultWhitelistName("");
    setLookupInput("");
    setError(null);
  }

  async function handleNameLookup() {
    const query = lookupInput.trim();
    if (!query) return;
    setLookingUp(true);
    try {
      const result = await invoke<{ uid: string; name: string } | null>("lookup_player_uid", {
        accountName: query,
      });
      if (result) {
        setDefaultWhitelistUid(result.uid);
        setDefaultWhitelistName(result.name);
      } else {
        toast.error(`Player "${query}" not found`);
      }
    } catch (err) {
      toast.error(`Lookup failed: ${String(err)}`);
    } finally {
      setLookingUp(false);
    }
  }

  async function handleUidLookup(uid: string) {
    if (!uid.trim()) return;
    try {
      const playerName = await invoke<string | null>("lookup_player_name", { uid: uid.trim() });
      if (playerName) setDefaultWhitelistName(playerName);
    } catch {
      // Name is informational only.
    }
  }

  function submit() {
    if (!name.trim()) {
      setError("Enter a server name");
      return;
    }
    if (!selectedVersion) {
      setError("Pick a game version");
      return;
    }
    setError(null);

    createInstance.mutate(
      {
        name: name.trim(),
        version: selectedVersion,
        port: Number(port) || 42420,
        bind_ip: bindIp,
        data_dir: dataDir.trim(),
        start_params: startParams,
        password,
        whitelistEnabled,
        defaultWhitelistUid,
        defaultWhitelistName,
      },
      {
        onError: (err) => toast.error(`Failed to create instance: ${String(err)}`),
        onSuccess: () => {
          reset();
          onOpenChange(false);
        },
      },
    );
  }

  return (
    <Sheet open={open} onOpenChange={(next) => !createInstance.isPending && onOpenChange(next)}>
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b">
          <SheetTitle>New server instance</SheetTitle>
          <SheetDescription>
            Set up a self-hosted Vintage Story server instance on this machine.
          </SheetDescription>
        </SheetHeader>

        <ScrollArea scrollFade className="min-h-0 flex-1">
          <div className="grid gap-4 p-4">
            <div className="grid gap-1.5">
              <label className="text-xs font-medium" htmlFor="hosted-name">
                Name
              </label>
              <Input
                id="hosted-name"
                placeholder="My Server"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </div>

            <div className="grid gap-1.5">
              <span className="text-xs font-medium">Version</span>
              <Select
                items={allVersions.map((v) => ({
                  label: installedVersionsSet.has(v) ? `${v} (installed)` : `${v} (not installed)`,
                  value: v,
                }))}
                value={selectedVersion}
                onValueChange={(value) => value && setVersion(value)}
              >
                <SelectTrigger className="w-full" aria-label="Game version">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {allVersions.map((v) => (
                    <SelectItem key={v} value={v}>
                      {v}
                      <span className="text-muted-foreground ml-2 text-xs">
                        {installedVersionsSet.has(v) ? "(installed)" : "(not installed)"}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <label className="text-xs font-medium" htmlFor="hosted-port">
                  Port
                </label>
                <Input
                  id="hosted-port"
                  inputMode="numeric"
                  value={port}
                  onChange={(event) => setPort(event.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <label className="text-xs font-medium" htmlFor="hosted-bind-ip">
                  Bind IP
                </label>
                <Input
                  id="hosted-bind-ip"
                  value={bindIp}
                  onChange={(event) => setBindIp(event.target.value)}
                />
              </div>
            </div>

            <div className="grid gap-1.5">
              <label className="text-xs font-medium" htmlFor="hosted-data-dir">
                Data directory
              </label>
              <Input
                id="hosted-data-dir"
                placeholder="Leave empty for an auto-generated path"
                value={dataDir}
                onChange={(event) => setDataDir(event.target.value)}
              />
            </div>

            <div className="grid gap-1.5">
              <label className="text-xs font-medium" htmlFor="hosted-start-params">
                Extra start parameters <span className="text-muted-foreground">(optional)</span>
              </label>
              <Input
                id="hosted-start-params"
                className="font-mono"
                placeholder="Additional CLI arguments"
                value={startParams}
                onChange={(event) => setStartParams(event.target.value)}
              />
            </div>

            <p className="text-muted-foreground border-t pt-4 text-[10px] font-medium tracking-widest uppercase">
              Server security
            </p>

            <div className="grid gap-1.5">
              <label className="text-xs font-medium" htmlFor="hosted-password">
                Password <span className="text-muted-foreground">(optional)</span>
              </label>
              <Input
                id="hosted-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>

            <div className="flex items-center justify-between gap-4">
              <div className="grid gap-0.5">
                <span className="text-xs font-medium">Enable whitelist</span>
                <span className="text-muted-foreground text-[11px]">
                  Only listed players can join.
                </span>
              </div>
              <Switch checked={whitelistEnabled} onCheckedChange={setWhitelistEnabled} />
            </div>

            {whitelistEnabled && (
              <>
                <div className="grid gap-1.5">
                  <span className="text-xs font-medium">Default whitelist player</span>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Vintage Story account name"
                      value={lookupInput}
                      onChange={(event) => setLookupInput(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") void handleNameLookup();
                      }}
                    />
                    <Button
                      disabled={!lookupInput.trim() || lookingUp}
                      size="sm"
                      type="button"
                      variant="outline"
                      onClick={() => void handleNameLookup()}
                    >
                      {lookingUp ? <Loader2 className="animate-spin" /> : <Search />}
                      Look up
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-1.5">
                    <label className="text-xs font-medium" htmlFor="hosted-whitelist-uid">
                      Player UID
                    </label>
                    <Input
                      id="hosted-whitelist-uid"
                      placeholder="Player UID"
                      value={defaultWhitelistUid}
                      onBlur={() => void handleUidLookup(defaultWhitelistUid)}
                      onChange={(event) => setDefaultWhitelistUid(event.target.value)}
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <label className="text-xs font-medium" htmlFor="hosted-whitelist-name">
                      Player name
                    </label>
                    <Input
                      id="hosted-whitelist-name"
                      placeholder="Player name"
                      value={defaultWhitelistName}
                      onChange={(event) => setDefaultWhitelistName(event.target.value)}
                    />
                  </div>
                </div>

                <Button
                  className="justify-self-start"
                  disabled={!selectedUser?.uid || !selectedUser.playername}
                  size="sm"
                  type="button"
                  variant="outline"
                  onClick={() => {
                    if (selectedUser?.uid && selectedUser?.playername) {
                      setDefaultWhitelistUid(selectedUser.uid);
                      setDefaultWhitelistName(selectedUser.playername);
                    }
                  }}
                >
                  + Add me
                </Button>
              </>
            )}

            {error && <p className="text-destructive text-xs">{error}</p>}
          </div>
        </ScrollArea>

        <SheetFooter className="border-t">
          <Button
            variant="accent-primary"
            disabled={createInstance.isPending || !selectedVersion}
            onClick={submit}
          >
            {createInstance.isPending ? (
              <>
                <Loader2 className="animate-spin" /> Creating…
              </>
            ) : (
              "Create instance"
            )}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
