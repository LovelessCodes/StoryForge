import { invoke } from "@tauri-apps/api/core";
import { Loader2, Trash2 } from "lucide-react";
import { useState } from "react";
import { Trans, useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  useAddToWhitelist,
  useBulkImportWhitelist,
  useRemoveFromWhitelist,
  useSendCommand,
  useServerStatus,
  useSetWhitelistMode,
  useWhitelist,
} from "@/hooks/queries/server-hosting";
import { errorMessage } from "@/lib/errors";
import { t as translate } from "@/lib/i18n";
import { toast } from "@/lib/notify";
import type { WhitelistEntry } from "@/lib/server-hosting-types";
import { useAccountStore } from "@/stores/accounts";

export default function ServerWhitelist({ instanceId }: { instanceId: number }) {
  const { t } = useTranslation();
  const { data, isLoading } = useWhitelist(instanceId);
  const { data: statusData } = useServerStatus(instanceId);
  const toggleMutation = useSetWhitelistMode();

  const status = statusData?.status;
  const isRunning = status === "running";
  const isBusy = status === "starting" || status === "stopping";

  const entries = data?.entries ?? [];
  const whitelistEnabled = data?.whitelistEnabled ?? true;

  return (
    <div className="grid gap-6">
      <div className="bg-muted/30 flex items-center justify-between gap-4 border p-3">
        <div className="grid gap-0.5">
          <span className="text-xs font-medium">{t("hosting.sections.whitelist")}</span>
          <span className="text-muted-foreground text-[11px]">
            {whitelistEnabled ? t("hosting.whitelist.enabled") : t("hosting.whitelist.disabled")}
          </span>
        </div>
        <Button
          disabled={isBusy || toggleMutation.isPending}
          size="sm"
          variant={whitelistEnabled ? "outline" : "outline-success"}
          onClick={() =>
            toggleMutation.mutate(
              { id: instanceId, enabled: !whitelistEnabled },
              {
                onError: (err) =>
                  toast.error(t("hosting.whitelist.modeFailed", { message: String(err) })),
              },
            )
          }
        >
          {whitelistEnabled ? t("hosting.whitelist.disable") : t("hosting.whitelist.enable")}
        </Button>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground py-8 text-center text-sm">
          {t("hosting.whitelist.loading")}
        </p>
      ) : entries.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 border border-dashed p-10 text-center">
          <p className="text-sm font-medium">{t("hosting.whitelist.emptyTitle")}</p>
          <p className="text-muted-foreground text-xs">{t("hosting.whitelist.emptyDescription")}</p>
        </div>
      ) : (
        <div className="border">
          <div className="text-muted-foreground bg-muted/30 grid grid-cols-[1fr_1fr_1fr_auto] gap-3 border-b px-3 py-2 text-[10px] font-medium tracking-widest uppercase">
            <span>{t("hosting.whitelist.player")}</span>
            <span>{t("hosting.whitelist.uid")}</span>
            <span>{t("hosting.whitelist.addedBy")}</span>
            <span className="w-24" />
          </div>
          <div className="divide-y">
            {entries.map((entry) => (
              <WhitelistRow
                entry={entry}
                instanceId={instanceId}
                isRunning={isRunning}
                key={entry.uid}
              />
            ))}
          </div>
        </div>
      )}

      <AddPlayerForm instanceId={instanceId} isRunning={isRunning} />
      <BulkImportForm instanceId={instanceId} />
    </div>
  );
}

/** One whitelist row; removal flips into an inline confirm. */
function WhitelistRow({
  entry,
  instanceId,
  isRunning,
}: {
  entry: WhitelistEntry;
  instanceId: number;
  isRunning: boolean;
}) {
  const removeMutation = useRemoveFromWhitelist();
  const sendCommand = useSendCommand();
  const { t } = useTranslation();
  const [confirming, setConfirming] = useState(false);

  function removeEntry() {
    removeMutation.mutate(
      { id: instanceId, uid: entry.uid },
      {
        onError: (err) =>
          toast.error(t("hosting.whitelist.removeFailed", { message: String(err) })),
        onSuccess: (_data, { uid }) => {
          setConfirming(false);
          if (!isRunning) return;
          sendCommand.mutate(
            { id: instanceId, command: `/whitelist remove ${entry.name || uid}` },
            {
              onError: () => toast.warning(t("hosting.whitelist.removeCommandFailed")),
            },
          );
        },
      },
    );
  }

  return (
    <div className="grid grid-cols-[1fr_1fr_1fr_auto] items-center gap-3 px-3 py-2">
      <span className="truncate text-sm">{entry.name}</span>
      <span className="text-muted-foreground truncate font-mono text-[11px]">{entry.uid}</span>
      <span className="text-muted-foreground truncate text-xs">
        {entry.added_by ?? t("hosting.whitelist.unknown")}
      </span>
      <div className="flex w-24 items-center justify-end gap-1">
        {confirming ? (
          <>
            <Button
              disabled={removeMutation.isPending}
              size="xs"
              variant="destructive"
              onClick={removeEntry}
            >
              {removeMutation.isPending ? (
                <Loader2 className="animate-spin" />
              ) : (
                t("hosting.whitelist.reallyRemove")
              )}
            </Button>
            <Button size="xs" variant="ghost" onClick={() => setConfirming(false)}>
              {t("common.actions.cancel")}
            </Button>
          </>
        ) : (
          <Button
            aria-label={t("hosting.whitelist.removeAria", { name: entry.name || entry.uid })}
            size="icon-sm"
            title={t("hosting.whitelist.removeTitle")}
            variant="ghost"
            onClick={() => setConfirming(true)}
          >
            <Trash2 className="text-destructive" />
          </Button>
        )}
      </div>
    </div>
  );
}

/** Account-name lookup plus manual UID/name entry. */
function AddPlayerForm({ instanceId, isRunning }: { instanceId: number; isRunning: boolean }) {
  const { t } = useTranslation();
  const [lookupName, setLookupName] = useState("");
  const [newUid, setNewUid] = useState("");
  const [newName, setNewName] = useState("");
  const addMutation = useAddToWhitelist();
  const sendCommand = useSendCommand();
  const { selectedUser } = useAccountStore();

  async function handleLookup() {
    const query = lookupName.trim();
    if (!query) return;
    try {
      const result = await invoke<WhitelistEntry | null>("lookup_player_uid", {
        accountName: query,
      });
      if (result) {
        setNewUid(result.uid);
        setNewName(result.name);
      } else {
        toast.error(t("hosting.whitelist.playerNotFound", { name: query }));
      }
    } catch (err) {
      toast.error(t("hosting.whitelist.lookupFailed", { message: String(err) }));
    }
  }

  async function handleUidLookup(uid: string) {
    if (!uid.trim() || newName.trim()) return;
    try {
      const playerName = await invoke<string | null>("lookup_player_name", { uid: uid.trim() });
      if (playerName) setNewName(playerName);
    } catch {
      // Name is informational only.
    }
  }

  function handleAdd() {
    const uid = newUid.trim();
    if (!uid) return;
    addMutation.mutate(
      { id: instanceId, uid, name: newName.trim() || uid },
      {
        onError: (err) => toast.error(t("hosting.whitelist.addFailed", { message: String(err) })),
        onSuccess: (entry) => {
          setNewUid("");
          setNewName("");
          setLookupName("");
          if (!isRunning) return;
          sendCommand.mutate(
            { id: instanceId, command: `/whitelist add ${entry.name}` },
            {
              onError: () => toast.warning(t("hosting.whitelist.addCommandFailed")),
            },
          );
        },
      },
    );
  }

  return (
    <div className="bg-muted/30 grid gap-3 border p-4">
      <p className="text-xs font-medium">{t("hosting.whitelist.addPlayer")}</p>

      <div className="flex gap-2">
        <Input
          placeholder={t("hosting.whitelist.accountNamePlaceholder")}
          value={lookupName}
          onChange={(event) => setLookupName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void handleLookup();
          }}
        />
        <Button
          disabled={!lookupName.trim()}
          size="sm"
          variant="outline"
          onClick={() => void handleLookup()}
        >
          {t("hosting.whitelist.lookupUid")}
        </Button>
      </div>

      <p className="text-muted-foreground text-center text-[11px]">
        {t("hosting.whitelist.orManual")}
      </p>

      <div className="grid grid-cols-2 gap-2">
        <Input
          placeholder={t("hosting.whitelist.uidPlaceholder")}
          value={newUid}
          onBlur={() => void handleUidLookup(newUid)}
          onChange={(event) => setNewUid(event.target.value)}
        />
        <Input
          placeholder={t("hosting.whitelist.namePlaceholder")}
          value={newName}
          onChange={(event) => setNewName(event.target.value)}
        />
      </div>

      <div className="flex gap-2">
        {selectedUser?.uid && selectedUser.playername && (
          <Button
            size="sm"
            type="button"
            variant="outline"
            onClick={() => {
              if (selectedUser.uid && selectedUser.playername) {
                setNewUid(selectedUser.uid);
                setNewName(selectedUser.playername);
              }
            }}
          >
            {t("hosting.whitelist.addMe")}
          </Button>
        )}
        <Button
          disabled={!newUid.trim() || addMutation.isPending}
          size="sm"
          variant="accent-primary"
          onClick={handleAdd}
        >
          {addMutation.isPending ? t("hosting.whitelist.adding") : t("common.actions.add")}
        </Button>
      </div>
    </div>
  );
}

/** Bulk import from a playerwhitelist.json-style payload. */
function BulkImportForm({ instanceId }: { instanceId: number }) {
  const { t } = useTranslation();
  const [json, setJson] = useState("");
  const bulkImport = useBulkImportWhitelist();

  function handleImport() {
    let entries: WhitelistEntry[];
    try {
      entries = parseBulkEntries(json);
    } catch (err) {
      const message = errorMessage(err);
      toast.error(t("hosting.whitelist.invalidJson", { message }));
      return;
    }
    bulkImport.mutate(
      { id: instanceId, entries },
      {
        onError: (err) =>
          toast.error(t("hosting.whitelist.importFailed", { message: String(err) })),
        onSuccess: () => {
          setJson("");
        },
      },
    );
  }

  return (
    <div className="grid gap-3 border p-4">
      <div>
        <p className="text-xs font-medium">{t("hosting.whitelist.bulkImport")}</p>
        <p className="text-muted-foreground text-[11px]">
          <Trans
            components={{ code: <span className="font-mono" /> }}
            i18nKey="hosting.whitelist.bulkDescription"
          />
        </p>
      </div>
      <Textarea
        className="min-h-28 font-mono text-[11px]"
        placeholder={t("hosting.whitelist.jsonPlaceholder")}
        value={json}
        onChange={(event) => setJson(event.target.value)}
      />
      <div className="flex justify-end">
        <Button
          disabled={!json.trim() || bulkImport.isPending}
          size="sm"
          variant="outline"
          onClick={handleImport}
        >
          {bulkImport.isPending ? t("hosting.whitelist.importing") : t("hosting.whitelist.import")}
        </Button>
      </div>
    </div>
  );
}

function parseBulkEntries(text: string): WhitelistEntry[] {
  const parsed: unknown = JSON.parse(text);
  const list: unknown[] | null = Array.isArray(parsed)
    ? parsed
    : typeof parsed === "object" &&
        parsed !== null &&
        Array.isArray((parsed as { entries?: unknown }).entries)
      ? (parsed as { entries: unknown[] }).entries
      : null;
  if (!list) throw new Error(translate("hosting.whitelist.errorNotArray"));

  const entries: WhitelistEntry[] = [];
  for (const item of list) {
    if (typeof item === "string" && item) {
      entries.push({ uid: item, name: item });
      continue;
    }
    if (typeof item !== "object" || item === null) continue;
    const uid = (item as { uid?: unknown }).uid;
    const name = (item as { name?: unknown }).name;
    if (typeof uid === "string" && uid) {
      entries.push({ name: typeof name === "string" && name ? name : uid, uid });
    }
  }
  if (entries.length === 0) throw new Error(translate("hosting.whitelist.errorNoEntries"));
  return entries;
}
