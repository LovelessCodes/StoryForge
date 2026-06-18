import { useForm } from "@tanstack/react-form";
import { useQuery } from "@tanstack/react-query";
import { Loader2Icon, SearchIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { rootDialogHandle } from "@/handles";
import { useCreateInstance } from "@/hooks/queries/server-hosting";
import { useInstalledVersionNames } from "@/hooks/use-installed-versions";
import { gameVersionsQuery } from "@/lib/queries";
import { compareSemverDesc } from "@/lib/utils";
import { useAccountStore } from "@/stores/accounts";

type Props = {
  onSuccess?: () => void;
};

export function CreateHostedServerDialog({ onSuccess }: Props) {
  const createInstance = useCreateInstance();
  const { selectedUser } = useAccountStore();

  const { data: gameVersions } = useQuery(gameVersionsQuery);
  const installedVersions = useInstalledVersionNames();

  const [lookupInput, setLookupInput] = useState("");
  const [lookingUp, setLookingUp] = useState(false);

  const allVersions = (gameVersions ?? []).sort(compareSemverDesc);
  const firstVersion = allVersions[0] ?? "";

  const form = useForm({
    defaultValues: {
      name: "",
      version: firstVersion,
      port: 42420,
      bindIp: "0.0.0.0",
      dataDir: "",
      startParams: "",
      password: "",
      whitelistEnabled: false,
      defaultWhitelistUid: "",
      defaultWhitelistName: "",
    },
    onSubmit: ({ value }) => {
      createInstance.mutate(
        {
          name: value.name,
          version: value.version,
          port: value.port,
          bind_ip: value.bindIp,
          data_dir: value.dataDir.trim(),
          start_params: value.startParams,
          password: value.password,
          whitelistEnabled: value.whitelistEnabled,
          defaultWhitelistUid: value.defaultWhitelistUid,
          defaultWhitelistName: value.defaultWhitelistName,
        },
        {
          onSuccess: () => {
            toast.success(`Instance "${value.name}" created`);
            onSuccess?.();
            rootDialogHandle.close();
          },
          onError: (e) => {
            toast.error(`Failed to create instance: ${String(e)}`);
          },
        },
      );
    },
  });

  const handleNameLookup = async () => {
    if (!lookupInput.trim()) return;
    setLookingUp(true);
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const result = await invoke<{ uid: string; name: string } | null>("lookup_player_uid", {
        accountName: lookupInput.trim(),
      });
      if (result) {
        form.setFieldValue("defaultWhitelistUid", result.uid);
        form.setFieldValue("defaultWhitelistName", result.name);
        toast.success(`Found: ${result.name} (UID: ${result.uid})`);
      } else {
        toast.error(`Player "${lookupInput.trim()}" not found`);
      }
    } catch (e) {
      toast.error(`Lookup failed: ${String(e)}`);
    } finally {
      setLookingUp(false);
    }
  };

  const handleUidLookup = async (uid: string) => {
    if (!uid.trim()) return;
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const name = await invoke<string | null>("lookup_player_name", { uid: uid.trim() });
      if (name) {
        form.setFieldValue("defaultWhitelistName", name);
      }
    } catch {
      // silent — name is informational only
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Create New Server Instance</DialogTitle>
        <DialogDescription>Set up a self-hosted Vintage Story server instance.</DialogDescription>
      </DialogHeader>

      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void form.handleSubmit();
        }}
      >
        {/* Name */}
        <form.Field name="name">
          {(field) => (
            <div className="grid gap-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                onChange={(e) => field.handleChange(e.target.value)}
                placeholder="My Server"
                required
                value={field.state.value}
              />
            </div>
          )}
        </form.Field>

        {/* Version */}
        <form.Field name="version">
          {(field) => (
            <div className="grid gap-2">
              <Label htmlFor="version">Version</Label>
              <Select onValueChange={(v) => v && field.handleChange(v)} value={field.state.value}>
                <SelectTrigger className="w-full">
                  {field.state.value || "Select version"}
                </SelectTrigger>
                <SelectContent>
                  {allVersions.map((v) => {
                    const isInstalled = installedVersions.includes(v);
                    return (
                      <SelectItem key={v} value={v}>
                        <span className="flex items-center gap-2">
                          {v}
                          {isInstalled ? (
                            <span className="text-muted-foreground text-xs">(installed)</span>
                          ) : (
                            <span className="text-muted-foreground text-xs">(not installed)</span>
                          )}
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          )}
        </form.Field>

        {/* Port + Bind IP */}
        <div className="grid grid-cols-2 gap-3">
          <form.Field name="port">
            {(field) => (
              <div className="grid gap-2">
                <Label htmlFor="port">Port</Label>
                <Input
                  id="port"
                  onChange={(e) => field.handleChange(Number(e.target.value) || 42420)}
                  type="number"
                  value={String(field.state.value)}
                />
              </div>
            )}
          </form.Field>
          <form.Field name="bindIp">
            {(field) => (
              <div className="grid gap-2">
                <Label htmlFor="bindIp">Bind IP</Label>
                <Input
                  id="bindIp"
                  onChange={(e) => field.handleChange(e.target.value)}
                  value={field.state.value}
                />
              </div>
            )}
          </form.Field>
        </div>

        {/* Data Directory */}
        <form.Field name="dataDir">
          {(field) => (
            <div className="grid gap-2">
              <Label htmlFor="dataDir">Data Directory</Label>
              <Input
                id="dataDir"
                onChange={(e) => field.handleChange(e.target.value)}
                placeholder="Leave empty for auto-generated path"
                value={field.state.value}
              />
            </div>
          )}
        </form.Field>

        {/* Start Params */}
        <form.Field name="startParams">
          {(field) => (
            <div className="grid gap-2">
              <Label htmlFor="startParams">Extra Start Parameters</Label>
              <Input
                id="startParams"
                onChange={(e) => field.handleChange(e.target.value)}
                placeholder="Additional CLI arguments (optional)"
                value={field.state.value}
              />
            </div>
          )}
        </form.Field>

        <hr className="border-border my-2" />

        <p className="text-sm font-semibold">Server Security</p>

        {/* Password */}
        <form.Field name="password">
          {(field) => (
            <div className="grid gap-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                onChange={(e) => field.handleChange(e.target.value)}
                placeholder="Optional server password"
                type="password"
                value={field.state.value}
              />
            </div>
          )}
        </form.Field>

        {/* Whitelist toggle */}
        <form.Field name="whitelistEnabled">
          {(field) => (
            <div className="flex items-center justify-between">
              <Label>Enable Whitelist</Label>
              <Switch
                checked={field.state.value}
                onCheckedChange={(checked) => field.handleChange(checked)}
              />
            </div>
          )}
        </form.Field>

        {/* Default whitelist user (conditional) */}
        <form.Subscribe selector={(s) => s.values.whitelistEnabled}>
          {(whitelistEnabled) =>
            whitelistEnabled ? (
              <>
                <p className="text-muted-foreground text-xs font-medium">Default Whitelist User</p>

                {/* Account name → UID lookup */}
                <div className="grid gap-2">
                  <Label>Look up by account name</Label>
                  <div className="flex gap-2">
                    <Input
                      onChange={(e) => setLookupInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void handleNameLookup();
                      }}
                      placeholder="Vintage Story account name"
                      value={lookupInput}
                    />
                    <Button
                      disabled={!lookupInput.trim() || lookingUp}
                      onClick={handleNameLookup}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      {lookingUp ? (
                        <Loader2Icon className="size-3 animate-spin" />
                      ) : (
                        <SearchIcon className="size-3" />
                      )}
                      Look up
                    </Button>
                  </div>
                </div>

                <p className="text-muted-foreground text-center text-xs">— or enter manually —</p>

                <div className="grid grid-cols-2 gap-2">
                  <form.Field name="defaultWhitelistUid">
                    {(field) => (
                      <div className="grid gap-2">
                        <Label htmlFor="defaultWhitelistUid">Player UID</Label>
                        <Input
                          id="defaultWhitelistUid"
                          onBlur={() => {
                            void handleUidLookup(field.state.value);
                          }}
                          onChange={(e) => field.handleChange(e.target.value)}
                          placeholder="Player UID"
                          value={field.state.value}
                        />
                      </div>
                    )}
                  </form.Field>
                  <form.Field name="defaultWhitelistName">
                    {(field) => (
                      <div className="grid gap-2">
                        <Label htmlFor="defaultWhitelistName">Player Name</Label>
                        <Input
                          id="defaultWhitelistName"
                          onChange={(e) => field.handleChange(e.target.value)}
                          placeholder="Player name"
                          value={field.state.value}
                        />
                      </div>
                    )}
                  </form.Field>
                </div>
                <Button
                  className="self-start"
                  disabled={!selectedUser?.uid}
                  onClick={() => {
                    if (selectedUser?.uid && selectedUser?.playername) {
                      form.setFieldValue("defaultWhitelistUid", selectedUser.uid);
                      form.setFieldValue("defaultWhitelistName", selectedUser.playername);
                    }
                  }}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  + Add me
                </Button>
              </>
            ) : null
          }
        </form.Subscribe>

        {/* Submit */}
        <div className="flex justify-end gap-2 pt-4">
          <form.Subscribe
            selector={(s) => ({
              canSubmit: s.canSubmit,
              isSubmitting: s.isSubmitting,
            })}
          >
            {(state) => (
              <Button
                disabled={state.isSubmitting || !state.canSubmit || createInstance.isPending}
                size="sm"
                type="submit"
                variant="default"
              >
                {state.isSubmitting || createInstance.isPending ? "Creating…" : "Create Instance"}
              </Button>
            )}
          </form.Subscribe>
        </div>
      </form>
    </>
  );
}
