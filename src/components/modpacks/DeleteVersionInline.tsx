import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth";
import { toast } from "@/lib/notify";

interface DeleteVersionInlineProps {
  modpackSlug: string;
  modpackName: string;
  version: string;
  onCancel: () => void;
}

/** Inline "type the version to confirm" strip shown inside a version row. */
export default function DeleteVersionInline({
  modpackSlug,
  modpackName,
  version,
  onCancel,
}: DeleteVersionInlineProps) {
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

  const canDelete = confirmText === version;

  async function handleDelete() {
    setDeleting(true);
    try {
      await authClient.deleteModpackVersion(modpackSlug, version);
      toast.success(`Deleted v${version} from ${modpackName}`);
      onCancel();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error("Failed to delete version", { description: message });
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="border-destructive/40 bg-destructive/5 grid gap-2 border p-2">
      <p className="text-xs">
        Permanently delete <strong>v{version}</strong>? This cannot be undone.
      </p>
      <div className="flex items-center gap-2">
        <Input
          autoFocus
          className="font-mono"
          disabled={deleting}
          placeholder={`Type ${version} to confirm`}
          value={confirmText}
          onChange={(event) => setConfirmText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && canDelete) void handleDelete();
            if (event.key === "Escape") onCancel();
          }}
        />
        <Button disabled={deleting} size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          disabled={!canDelete || deleting}
          size="sm"
          variant="destructive"
          onClick={() => void handleDelete()}
        >
          {deleting ? "Deleting…" : "Delete"}
        </Button>
      </div>
    </div>
  );
}
