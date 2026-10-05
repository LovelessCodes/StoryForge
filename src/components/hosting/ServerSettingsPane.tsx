import { useNavigate } from "@tanstack/react-router";
import { AlertTriangle, Trash2, X } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

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
  const { t } = useTranslation();
  const navigate = useNavigate();
  const instance = useHostedServer(instanceId);
  const updateInstance = useUpdateInstance();
  const deleteInstance = useDeleteInstance();

  // Nullable overrides of the fetched instance, so no effect has to copy
  // server values into state after the query resolves.
  const [editedName, setEditedName] = useState<string | null>(null);
  const [editedPort, setEditedPort] = useState<string | null>(null);
  const [editedBindIp, setEditedBindIp] = useState<string | null>(null);
  const [editedSchedule, setEditedSchedule] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteData, setDeleteData] = useState(false);

  if (!instance) {
    return (
      <p className="text-muted-foreground py-8 text-center text-sm">
        {t("hosting.instanceNotFound")}
      </p>
    );
  }

  const name = editedName ?? instance.name;
  const port = editedPort ?? String(instance.port ?? "");
  const bindIp = editedBindIp ?? instance.bind_ip;
  const fallbackPort = instance.port;
  const scheduleValue = (editedSchedule ?? instance.restart_schedule ?? "").slice(0, 5);

  function saveSchedule() {
    if (!instance) return;
    const value = (editedSchedule ?? instance.restart_schedule ?? "").slice(0, 5);
    if (value === (instance.restart_schedule ?? "")) return;
    updateInstance.mutate(
      { id: instanceId, partial: { restart_schedule: value } },
      {
        onError: (err) => toast.error(t("hosting.settings.saveFailed", { message: String(err) })),
        onSuccess: () => {
          setEditedSchedule(null);
          toast.success(t("hosting.settings.saved"));
        },
      },
    );
  }

  function clearSchedule() {
    if (!instance) return;
    updateInstance.mutate(
      { id: instanceId, partial: { restart_schedule: "" } },
      {
        onError: (err) => toast.error(t("hosting.settings.saveFailed", { message: String(err) })),
        onSuccess: () => {
          setEditedSchedule(null);
          toast.success(t("hosting.settings.saved"));
        },
      },
    );
  }

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
        onError: (err) => toast.error(t("hosting.settings.saveFailed", { message: String(err) })),
        onSuccess: () => {
          setEditedName(null);
          setEditedPort(null);
          setEditedBindIp(null);
          toast.success(t("hosting.settings.saved"));
        },
      },
    );
  }

  function handleDelete() {
    deleteInstance.mutate(
      { id: instanceId, deleteData },
      {
        onError: (err) => toast.error(t("hosting.settings.deleteFailed", { message: String(err) })),
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
            {t("common.fields.name")}
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
              {t("common.fields.port")}
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
              {t("hosting.settings.bindIp")}
            </label>
            <Input
              id="hosted-settings-bind-ip"
              value={bindIp}
              onChange={(event) => setEditedBindIp(event.target.value)}
            />
          </div>
        </div>
        <div className="grid gap-1.5">
          <span className="text-xs font-medium">{t("hosting.settings.dataDirectory")}</span>
          <p className="bg-muted text-muted-foreground border p-2 font-mono text-[11px] break-all">
            {instance.data_dir}
          </p>
        </div>

        <div className="grid gap-3 border p-3">
          <span className="text-xs font-semibold">{t("hosting.restarts.title")}</span>
          <div className="flex items-center justify-between gap-4">
            <div className="grid gap-0.5">
              <span className="text-xs font-medium">{t("hosting.restarts.autoLabel")}</span>
              <span className="text-muted-foreground text-[11px]">
                {t("hosting.restarts.autoHint")}
              </span>
            </div>
            <Switch
              checked={instance.auto_restart}
              onCheckedChange={(auto_restart) =>
                updateInstance.mutate(
                  { id: instanceId, partial: { auto_restart } },
                  {
                    onError: (err) =>
                      toast.error(t("hosting.settings.saveFailed", { message: String(err) })),
                    onSuccess: () => toast.success(t("hosting.settings.saved")),
                  },
                )
              }
            />
          </div>
          <div className="flex items-center justify-between gap-4">
            <div className="grid gap-0.5">
              <span className="text-xs font-medium">{t("hosting.restarts.scheduleLabel")}</span>
              <span className="text-muted-foreground text-[11px]">
                {t("hosting.restarts.scheduleHint")}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Input
                className="w-28"
                id="hosted-settings-restart"
                type="time"
                value={scheduleValue}
                onBlur={saveSchedule}
                onChange={(event) => setEditedSchedule(event.target.value)}
              />
              {instance.restart_schedule && (
                <Button
                  aria-label={t("hosting.restarts.clear")}
                  disabled={updateInstance.isPending}
                  onClick={() => clearSchedule()}
                  size="icon-sm"
                  title={t("hosting.restarts.clear")}
                  variant="ghost"
                >
                  <X />
                </Button>
              )}
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <Button
            disabled={updateInstance.isPending}
            size="sm"
            variant="accent-primary"
            onClick={handleSave}
          >
            {updateInstance.isPending ? t("hosting.settings.saving") : t("hosting.settings.save")}
          </Button>
        </div>
      </div>

      <Card className="ring-destructive/30">
        <CardHeader>
          <CardTitle className="text-destructive flex items-center gap-2">
            <AlertTriangle className="size-4" />
            {t("hosting.settings.dangerZone")}
          </CardTitle>
          <CardDescription>{t("hosting.settings.dangerDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            disabled={!canDelete}
            size="sm"
            title={canDelete ? undefined : t("hosting.settings.stopBeforeDelete")}
            variant="destructive"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 /> {t("hosting.settings.deleteInstance")}
          </Button>
        </CardContent>
      </Card>

      <Sheet
        open={deleteOpen}
        onOpenChange={(next) => !deleteInstance.isPending && setDeleteOpen(next)}
      >
        <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-sm">
          <SheetHeader className="border-b">
            <SheetTitle>{t("hosting.settings.deleteTitle", { name: instance.name })}</SheetTitle>
            <SheetDescription>{t("hosting.settings.deleteDescription")}</SheetDescription>
          </SheetHeader>
          <div className="flex items-center justify-between gap-4 p-4">
            <div className="grid gap-0.5">
              <span className="text-xs font-medium">{t("hosting.settings.deleteData")}</span>
              <span className="text-muted-foreground text-[11px]">
                {t("hosting.settings.deleteDataDescription")}
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
              {deleteInstance.isPending
                ? t("hosting.settings.deleting")
                : t("common.actions.delete")}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
