import { useState } from "react";
import { Trans, useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth";
import { errorMessage } from "@/lib/errors";
import { toast } from "@/lib/notify";

interface DeleteVersionInlineProps {
  modpackSlug: string;
  version: string;
  onCancel: () => void;
}

/** Inline "type the version to confirm" strip shown inside a version row. */
export default function DeleteVersionInline({
  modpackSlug,
  version,
  onCancel,
}: DeleteVersionInlineProps) {
  const { t } = useTranslation();
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

  const canDelete = confirmText === version;

  async function handleDelete() {
    setDeleting(true);
    try {
      await authClient.deleteModpackVersion(modpackSlug, version);
      onCancel();
    } catch (error) {
      const message = errorMessage(error);
      toast.error(t("modpacks.deleteVersion.failed"), { description: message });
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="border-destructive/40 bg-destructive/5 grid gap-2 border p-2">
      <p className="text-xs">
        <Trans i18nKey="modpacks.deleteVersion.confirm" values={{ version }} />
      </p>
      <div className="flex items-center gap-2">
        <Input
          autoFocus
          className="font-mono"
          disabled={deleting}
          placeholder={t("modpacks.deleteVersion.confirmPlaceholder", { version })}
          value={confirmText}
          onChange={(event) => setConfirmText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && canDelete) void handleDelete();
            if (event.key === "Escape") onCancel();
          }}
        />
        <Button disabled={deleting} size="sm" variant="ghost" onClick={onCancel}>
          {t("common.actions.cancel")}
        </Button>
        <Button
          disabled={!canDelete || deleting}
          size="sm"
          variant="destructive"
          onClick={() => void handleDelete()}
        >
          {deleting ? t("modpacks.deleteVersion.pending") : t("common.actions.delete")}
        </Button>
      </div>
    </div>
  );
}
