import { useNavigate } from "@tanstack/react-router";
import { AlertTriangle, Trash2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import {
  useDeleteInstance,
  useHostedServer,
  useUpdateInstance,
} from "@/hooks/queries/server-hosting";
import { toast } from "@/lib/notify";

interface ServerSettingsPaneProps {
  instanceId: number;
  canDelete: boolean;
}

export default function ServerSettingsPane({ instanceId, canDelete }: ServerSettingsPaneProps) {
  const navigate = useNavigate();
  const instance = useHostedServer(instanceId);
  const updateInstance = useUpdateInstance();
  const deleteInstance = useDeleteInstance();

  // Nullable overrides of the fetched instance, so no effect has to copy
  // server values into state after the query resolves.
  const [editedName, setEditedName] = useState<string | null>(null);
  const [editedPort, setEditedPort] = useState<string | null>(null);
  const [editedBindIp, setEditedBindIp] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteData, setDeleteData] = useState(false);

  if (!instance) {
    return <p className="text-muted-foreground py-8 text-center text-sm">Instance not found.</p>;
  }

  const name = editedName ?? instance.name;
  const port = editedPort ?? String(instance.port ?? "");
  const bindIp = editedBindIp ?? instance.bind_ip;
  const fallbackPort = instance.port;

  function handleSave() {
    updateInstance.mutate(
      {
        id: instanceId,
        partial: {
          name: name.trim(),
          port: Number(port) || fallbackPort,
          bind_ip: bindIp,
        },
      },
      {
        onError: (err) => toast.error(`Failed to save settings: ${String(err)}`),
        onSuccess: () => {
          setEditedName(null);
          setEditedPort(null);
          setEditedBindIp(null);
          toast.success("Settings saved");
        },
      },
    );
  }

  function handleDelete() {
    deleteInstance.mutate(
      { id: instanceId, deleteData },
      {
        onError: (err) => toast.error(`Failed to delete instance: ${String(err)}`),
        onSuccess: () => {
          setDeleteOpen(false);
          void navigate({
            to: "/servers",
            search: ((prev: Record<string, unknown>) => ({ ...prev, tab: "hosting" })) as never,
          });
        },
      },
    );
  }

  return (
    <div className="grid max-w-2xl gap-6">
      <div className="grid gap-4">
        <div className="grid gap-1.5">
          <label className="text-xs font-medium" htmlFor="hosted-settings-name">
            Name
          </label>
          <Input
            id="hosted-settings-name"
            value={name}
            onChange={(event) => setEditedName(event.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <label className="text-xs font-medium" htmlFor="hosted-settings-port">
              Port
            </label>
            <Input
              id="hosted-settings-port"
              inputMode="numeric"
              value={port}
              onChange={(event) => setEditedPort(event.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <label className="text-xs font-medium" htmlFor="hosted-settings-bind-ip">
              Bind IP
            </label>
            <Input
              id="hosted-settings-bind-ip"
              value={bindIp}
              onChange={(event) => setEditedBindIp(event.target.value)}
            />
          </div>
        </div>
        <div className="grid gap-1.5">
          <span className="text-xs font-medium">Data directory</span>
          <p className="bg-muted text-muted-foreground border p-2 font-mono text-[11px] break-all">
            {instance.data_dir}
          </p>
        </div>
        <div className="flex justify-end">
          <Button
            disabled={updateInstance.isPending}
            size="sm"
            variant="accent-primary"
            onClick={handleSave}
          >
            {updateInstance.isPending ? "Saving…" : "Save settings"}
          </Button>
        </div>
      </div>

      <Card className="ring-destructive/30">
        <CardHeader>
          <CardTitle className="text-destructive flex items-center gap-2">
            <AlertTriangle className="size-4" />
            Danger Zone
          </CardTitle>
          <CardDescription>
            Deleting an instance is permanent. You can optionally also delete all server data
            (worlds, mods, config).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            disabled={!canDelete}
            size="sm"
            title={canDelete ? undefined : "Stop the server before deleting it"}
            variant="destructive"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 /> Delete instance
          </Button>
        </CardContent>
      </Card>

      <Sheet
        open={deleteOpen}
        onOpenChange={(next) => !deleteInstance.isPending && setDeleteOpen(next)}
      >
        <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-sm">
          <SheetHeader className="border-b">
            <SheetTitle>Delete “{instance.name}”?</SheetTitle>
            <SheetDescription>
              This action cannot be undone. The instance configuration will be permanently removed.
            </SheetDescription>
          </SheetHeader>
          <div className="flex items-center justify-between gap-4 p-4">
            <div className="grid gap-0.5">
              <span className="text-xs font-medium">Also delete all server data</span>
              <span className="text-muted-foreground text-[11px]">
                Worlds, mods and config are removed from disk.
              </span>
            </div>
            <Switch checked={deleteData} onCheckedChange={setDeleteData} />
          </div>
          <SheetFooter className="border-t">
            <Button
              disabled={deleteInstance.isPending}
              variant="destructive"
              onClick={handleDelete}
            >
              {deleteInstance.isPending ? "Deleting…" : "Delete"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
