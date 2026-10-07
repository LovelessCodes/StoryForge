import { Gavel } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useSendCommand, useServerStatus } from "@/hooks/queries/server-hosting";
import { toast } from "@/lib/notify";

/** Quick kick / ban / unban actions over the server console. */
export default function ServerModeration({ instanceId }: { instanceId: number }) {
  const { t } = useTranslation();
  const status = useServerStatus(instanceId);
  const sendCommand = useSendCommand();
  const [target, setTarget] = useState("");

  const isRunning = status.data?.status === "running";
  const disabled = !isRunning || target.trim().length === 0 || sendCommand.isPending;

  function run(action: "kick" | "ban" | "unban") {
    const name = target.trim();
    if (!name) return;
    sendCommand.mutate(
      { id: instanceId, command: `/${action} ${name}` },
      {
        onError: (error) =>
          toast.error(t("hosting.moderation.failed"), { description: String(error) }),
        onSuccess: () => {
          toast.success(
            t(
              action === "kick"
                ? "hosting.moderation.kicked"
                : action === "ban"
                  ? "hosting.moderation.banned"
                  : "hosting.moderation.unbanned",
            ),
          );
          setTarget("");
        },
      },
    );
  }

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Gavel className="size-4" />
          {t("hosting.moderation.title")}
        </CardTitle>
        <CardDescription>{t("hosting.moderation.description")}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid gap-1.5">
          <label className="text-xs font-medium" htmlFor="moderation-target">
            {t("hosting.moderation.targetLabel")}
          </label>
          <Input
            disabled={!isRunning}
            id="moderation-target"
            placeholder={t("hosting.moderation.targetPlaceholder")}
            value={target}
            onChange={(event) => setTarget(event.target.value)}
          />
        </div>
        {!isRunning && (
          <p className="text-muted-foreground text-[11px]">{t("hosting.moderation.notRunning")}</p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button disabled={disabled} onClick={() => run("kick")} size="sm" variant="outline">
            {t("hosting.moderation.kick")}
          </Button>
          <Button
            disabled={disabled}
            onClick={() => run("ban")}
            size="sm"
            variant="outline-warning"
          >
            {t("hosting.moderation.ban")}
          </Button>
          <Button
            disabled={disabled}
            onClick={() => run("unban")}
            size="sm"
            variant="outline-success"
          >
            {t("hosting.moderation.unban")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
