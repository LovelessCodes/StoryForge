import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { Loader2, Search } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

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
  const { t } = useTranslation();
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
        toast.error(t("servers.create.playerNotFound", { name: query }));
      }
    } catch (err) {
      toast.error(t("servers.create.lookupFailed", { error: String(err) }));
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
      setError(t("servers.create.errorName"));
      return;
    }
    if (!selectedVersion) {
      setError(t("servers.create.errorVersion"));
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
        onError: (err) => toast.error(t("servers.create.createFailed", { error: String(err) })),
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
          <SheetTitle>{t("servers.create.title")}</SheetTitle>
          <SheetDescription>{t("servers.create.description")}</SheetDescription>
        </SheetHeader>

        <ScrollArea scrollFade className="min-h-0 flex-1">
          <div className="grid gap-4 p-4">
            <div className="grid gap-1.5">
              <label className="text-xs font-medium" htmlFor="hosted-name">
                {t("common.fields.name")}
              </label>
              <Input
                id="hosted-name"
                placeholder={t("servers.create.namePlaceholder")}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </div>

            <div className="grid gap-1.5">
              <span className="text-xs font-medium">{t("common.fields.version")}</span>
              <Select
                items={allVersions.map((v) => ({
                  label: installedVersionsSet.has(v)
                    ? t("servers.create.installedOption", { version: v })
                    : t("servers.create.notInstalledOption", { version: v }),
                  value: v,
                }))}
                value={selectedVersion}
                onValueChange={(value) => value && setVersion(value)}
              >
                <SelectTrigger className="w-full" aria-label={t("servers.create.gameVersionAria")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {allVersions.map((v) => (
                    <SelectItem key={v} value={v}>
                      {v}
                      <span className="text-muted-foreground ml-2 text-xs">
                        {installedVersionsSet.has(v)
                          ? t("servers.create.installed")
                          : t("servers.create.notInstalled")}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <label className="text-xs font-medium" htmlFor="hosted-port">
                  {t("common.fields.port")}
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
                  {t("servers.create.bindIp")}
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
                {t("servers.create.dataDirectory")}
              </label>
              <Input
                id="hosted-data-dir"
                placeholder={t("servers.create.dataDirectoryPlaceholder")}
                value={dataDir}
                onChange={(event) => setDataDir(event.target.value)}
              />
            </div>

            <div className="grid gap-1.5">
              <label className="text-xs font-medium" htmlFor="hosted-start-params">
                {t("servers.create.startParams")}{" "}
                <span className="text-muted-foreground">({t("common.states.optional")})</span>
              </label>
              <Input
                id="hosted-start-params"
                className="font-mono"
                placeholder={t("servers.create.startParamsPlaceholder")}
                value={startParams}
                onChange={(event) => setStartParams(event.target.value)}
              />
            </div>

            <p className="text-muted-foreground border-t pt-4 text-[10px] font-medium tracking-widest uppercase">
              {t("servers.create.securityHeading")}
            </p>

            <div className="grid gap-1.5">
              <label className="text-xs font-medium" htmlFor="hosted-password">
                {t("common.fields.password")}{" "}
                <span className="text-muted-foreground">({t("common.states.optional")})</span>
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
                <span className="text-xs font-medium">{t("servers.create.enableWhitelist")}</span>
                <span className="text-muted-foreground text-[11px]">
                  {t("servers.create.whitelistHint")}
                </span>
              </div>
              <Switch checked={whitelistEnabled} onCheckedChange={setWhitelistEnabled} />
            </div>

            {whitelistEnabled && (
              <>
                <div className="grid gap-1.5">
                  <span className="text-xs font-medium">
                    {t("servers.create.defaultWhitelistPlayer")}
                  </span>
                  <div className="flex gap-2">
                    <Input
                      placeholder={t("servers.create.accountNamePlaceholder")}
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
                      {t("servers.create.lookup")}
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-1.5">
                    <label className="text-xs font-medium" htmlFor="hosted-whitelist-uid">
                      {t("servers.create.playerUid")}
                    </label>
                    <Input
                      id="hosted-whitelist-uid"
                      placeholder={t("servers.create.playerUid")}
                      value={defaultWhitelistUid}
                      onBlur={() => void handleUidLookup(defaultWhitelistUid)}
                      onChange={(event) => setDefaultWhitelistUid(event.target.value)}
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <label className="text-xs font-medium" htmlFor="hosted-whitelist-name">
                      {t("servers.create.playerName")}
                    </label>
                    <Input
                      id="hosted-whitelist-name"
                      placeholder={t("servers.create.playerName")}
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
                  {t("servers.create.addMe")}
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
                <Loader2 className="animate-spin" /> {t("servers.create.creating")}
              </>
            ) : (
              t("servers.create.submit")
            )}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
