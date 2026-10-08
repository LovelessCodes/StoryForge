import { invoke } from "@tauri-apps/api/core";
import { Check, Loader2, X } from "lucide-react";
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
import { useActiveProfile } from "@/hooks/use-active-profile";
import { useAddServerToProfile } from "@/hooks/use-add-server-to-profile";
import { useRemoveServerFromProfile } from "@/hooks/use-remove-server-from-profile";
import { errorMessage } from "@/lib/errors";
import { toast } from "@/lib/notify";
import { useProfiles } from "@/stores/profiles";
import { useServerStore, type Server } from "@/stores/servers";

import { sameMinorVersion, serverEntryString, type SniffResult } from "./server-utils";

interface ServerFormSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Fires after the close animation finishes (the parent clears its state). */
  onOpenChangeComplete?: (open: boolean) => void;
  /** Existing server to edit; null/undefined to add a new one. */
  server?: Server | null;
}

export default function ServerFormSheet({
  open,
  onOpenChange,
  onOpenChangeComplete,
  server,
}: ServerFormSheetProps) {
  const { t } = useTranslation();
  const isEdit = server != null;
  const { profiles } = useProfiles();
  const { activeProfile } = useActiveProfile();
  const addServerToStore = useServerStore((s) => s.addServer);
  const updateServer = useServerStore((s) => s.updateServer);
  const loadServers = useServerStore((s) => s.loadServers);
  const addServerToProfile = useAddServerToProfile();
  const removeServerFromProfile = useRemoveServerFromProfile();

  const [name, setName] = useState(server?.name ?? "");
  const [password, setPassword] = useState(server?.password ?? "");
  const [ip, setIp] = useState(server?.ip ?? "");
  const [port, setPort] = useState(server?.port?.toString() ?? "42420");
  const [profileId, setProfileId] = useState(
    server
      ? String(server.profileId)
      : activeProfile
        ? String(activeProfile.id)
        : profiles[0]
          ? String(profiles[0].id)
          : "0",
  );
  const [sniffResult, setSniffResult] = useState<SniffResult | null>(null);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [createdAt] = useState(() => Date.now());

  const selectedProfile =
    profiles.find((p) => String(p.id) === profileId) ??
    (profileId === "0" && !isEdit ? profiles[0] : undefined);
  const effectiveProfileId = selectedProfile ? String(selectedProfile.id) : profileId;
  const busy = addServerToProfile.isPending || removeServerFromProfile.isPending;

  function parsePort(): number | null {
    if (!port.length) return null;
    return /^\d+$/.test(port) ? Number.parseInt(port, 10) : null;
  }

  async function testServer() {
    setTesting(true);
    try {
      const result = await invoke<SniffResult>("sniff_server", {
        host: ip,
        password: password || undefined,
        port: port ? Number.parseInt(port, 10) : undefined,
      });
      setSniffResult(result);
    } catch (err) {
      toast.error(t("servers.form.testFailed", { error: errorMessage(err) }));
      setSniffResult(null);
    } finally {
      setTesting(false);
    }
  }

  function validate(): string | null {
    if (!name.trim()) return t("servers.form.errorName");
    if (!ip.trim()) return t("servers.form.errorAddress");
    if (port.length > 0 && parsePort() === null) return t("servers.form.errorPort");
    if (!selectedProfile) return t("servers.form.errorProfile");
    return null;
  }

  async function submit() {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);

    const next: Server = {
      favorite: server?.favorite ?? false,
      id: server?.id ?? createdAt,
      rowKey: server?.rowKey ?? `temp-${createdAt}`,
      index: server?.index ?? createdAt,
      name: name.trim(),
      ip: ip.trim(),
      port: parsePort(),
      password,
      profileId: selectedProfile?.id ?? 0,
      profileName: selectedProfile?.name ?? "",
    };

    try {
      if (isEdit && server) {
        // The old entry may live in a different profile's clientsettings.json.
        await removeServerFromProfile.mutateAsync({
          profileId: server.profileId,
          server: serverEntryString(server),
        });
        await addServerToProfile.mutateAsync({
          profileId: next.profileId,
          server: serverEntryString(next),
        });
        updateServer(next, async (status) => {
          if (status) {
            await loadServers();
            onOpenChange(false);
          }
        });
      } else {
        addServerToProfile.mutate(
          { profileId: next.profileId, server: serverEntryString(next) },
          {
            onError: (err) =>
              toast.error(t("servers.form.addFailed", { error: err.message }), {
                id: `add-server-${next.name}-${next.ip}`,
              }),
            onSuccess: () => {
              addServerToStore(next, async (status) => {
                if (status) {
                  await loadServers();
                  onOpenChange(false);
                }
              });
            },
          },
        );
      }
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  const submitLabel = busy
    ? isEdit
      ? t("servers.form.updating")
      : t("servers.form.adding")
    : isEdit
      ? t("servers.form.updateSubmit")
      : t("servers.form.addSubmit");

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => !busy && onOpenChange(next)}
      onOpenChangeComplete={onOpenChangeComplete}
    >
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b">
          <SheetTitle>
            {isEdit
              ? t("servers.form.editTitle", { name: server?.name ?? "" })
              : t("servers.form.addTitle")}
          </SheetTitle>
          <SheetDescription>{t("servers.form.description")}</SheetDescription>
        </SheetHeader>

        <ScrollArea scrollFade className="min-h-0 flex-1">
          <div className="grid gap-4 p-4">
            <div className="grid gap-1.5">
              <label className="text-xs font-medium" htmlFor="server-name">
                {t("common.fields.name")}
              </label>
              <Input
                id="server-name"
                placeholder={t("servers.form.namePlaceholder")}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </div>

            <div className="grid gap-1.5">
              <label className="text-xs font-medium" htmlFor="server-password">
                {t("common.fields.password")}{" "}
                <span className="text-muted-foreground">({t("common.states.optional")})</span>
              </label>
              <Input
                id="server-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <label className="text-xs font-medium" htmlFor="server-ip">
                  {t("servers.form.ipAddress")}
                </label>
                <Input
                  id="server-ip"
                  placeholder="127.0.0.1"
                  value={ip}
                  onChange={(event) => setIp(event.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <label className="text-xs font-medium" htmlFor="server-port">
                  {t("common.fields.port")}
                </label>
                <Input
                  id="server-port"
                  inputMode="numeric"
                  value={port}
                  onChange={(event) => setPort(event.target.value)}
                />
              </div>
            </div>

            <div className="grid gap-1.5">
              <span className="text-xs font-medium">
                {t("servers.profile")} <span className="text-destructive">*</span>
              </span>
              <Select
                items={profiles.map((p) => ({
                  label: `${p.name} (v${p.version})`,
                  value: String(p.id),
                }))}
                value={effectiveProfileId}
                onValueChange={(value) => value && setProfileId(value)}
              >
                <SelectTrigger className="w-full" aria-label={t("servers.profile")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {profiles.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      {p.name}
                      <span className="text-muted-foreground ml-2 text-xs">v{p.version}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {profiles.length === 0 && (
                <p className="text-muted-foreground text-[11px]">
                  {t("servers.form.createProfileFirst")}
                </p>
              )}
            </div>

            <Button
              className="w-full"
              disabled={testing || !ip.trim()}
              onClick={() => void testServer()}
              type="button"
              variant="outline"
            >
              {testing ? (
                <>
                  <Loader2 className="animate-spin" /> {t("servers.form.testing")}
                </>
              ) : (
                t("servers.form.test")
              )}
            </Button>

            {sniffResult && (
              <SniffResultPanel result={sniffResult} version={selectedProfile?.version} />
            )}

            {error && <p className="text-destructive text-xs">{error}</p>}
          </div>
        </ScrollArea>

        <SheetFooter className="border-t">
          <Button
            variant="accent-primary"
            disabled={busy || profiles.length === 0}
            onClick={() => void submit()}
          >
            {submitLabel}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

/** Result of the Test server probe. */
function SniffResultPanel({ result, version }: { result: SniffResult; version?: string }) {
  const { t } = useTranslation();
  const versionMatches = sameMinorVersion(version, result.server_game_version ?? undefined);

  return (
    <div className="bg-muted/50 grid gap-1 border p-3 text-xs">
      {result.server_game_version && (
        <p>
          <span className="text-muted-foreground">{t("servers.form.probeVersion")}</span>{" "}
          <span className="font-mono">v{result.server_game_version}</span>
          {version && (
            <span className={versionMatches ? "text-success ml-2" : "text-destructive ml-2"}>
              {versionMatches ? t("servers.form.probeMatches") : t("servers.form.probeDiffers")}
            </span>
          )}
        </p>
      )}
      {result.password_protected && (
        <p className="flex items-center gap-1">
          <span className="text-muted-foreground">{t("servers.form.probePassword")}</span>
          {result.password_valid === true ? (
            <span className="text-success flex items-center gap-1">
              <Check className="size-3" /> {t("servers.form.probeCorrect")}
            </span>
          ) : result.password_valid === false ? (
            <span className="text-destructive flex items-center gap-1">
              <X className="size-3" /> {t("servers.form.probeIncorrect")}
            </span>
          ) : (
            <span className="text-warning">{t("servers.form.probePasswordRequired")}</span>
          )}
        </p>
      )}
      {result.whitelisted && <p className="text-warning">{t("servers.form.probeWhitelisted")}</p>}
      {result.server_full && <p className="text-destructive">{t("servers.form.probeFull")}</p>}
      {result.banned && <p className="text-destructive">{t("servers.form.probeBanned")}</p>}
      {result.disconnect_message && (
        <p className="text-muted-foreground truncate">{result.disconnect_message}</p>
      )}
    </div>
  );
}
