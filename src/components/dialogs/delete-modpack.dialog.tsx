import { CopyIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import {
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Group, GroupSeparator } from "@/components/ui/group";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { rootAlertDialogHandle } from "@/handles";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import { authClient } from "@/lib/auth";

export type DeleteModpackDialogProps = {
  slug: string;
  name: string;
  onDeleted?: () => void;
};

export function DeleteModpackDialog({ slug, name, onDeleted }: DeleteModpackDialogProps) {
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [, copy] = useCopyToClipboard();

  const canDelete = confirmText === slug;

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await authClient.deleteModpack(slug);
      toast.success(`Deleted "${name}"`);
      onDeleted?.();
      rootAlertDialogHandle.close();
    } catch (e) {
      toast.error(`Failed to delete: ${e as Error}`);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <AlertDialogHeader>
        <AlertDialogTitle>Delete modpack</AlertDialogTitle>
        <AlertDialogDescription>
          This will permanently delete <strong>{name}</strong> and all its versions. This action
          cannot be undone.
        </AlertDialogDescription>
      </AlertDialogHeader>

      <div className="flex flex-col gap-2 px-6">
        <Label htmlFor="confirm-slug">
          Type{" "}
          <Group className="flex items-center">
            <code className="bg-muted rounded px-1 font-mono text-xs">{slug}</code>
            <GroupSeparator />
            <Button
              aria-label="Copy slug"
              onClick={() => copy(slug)}
              size="icon-xs"
              variant="outline"
            >
              <CopyIcon className="size-3" />
            </Button>
          </Group>{" "}
          to confirm
        </Label>
        <Input
          autoFocus
          className="flex-1"
          id="confirm-slug"
          onChange={(e) => setConfirmText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && canDelete) void handleDelete();
          }}
          placeholder={slug}
          value={confirmText}
        />
      </div>

      <AlertDialogFooter>
        <AlertDialogClose disabled={deleting} render={<Button variant="outline" />}>
          Cancel
        </AlertDialogClose>
        <Button disabled={!canDelete || deleting} onClick={handleDelete} variant="destructive">
          {deleting ? "Deleting…" : "Delete modpack"}
        </Button>
      </AlertDialogFooter>
    </>
  );
}

export type DeleteModpackVersionDialogProps = {
  modpackSlug: string;
  modpackName: string;
  version: string;
  onDeleted?: () => void;
};

export function DeleteModpackVersionDialog({
  modpackSlug,
  modpackName,
  version,
  onDeleted,
}: DeleteModpackVersionDialogProps) {
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [, copy] = useCopyToClipboard();

  const canDelete = confirmText === version;

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await authClient.deleteModpackVersion(modpackSlug, version);
      toast.success(`Deleted version v${version} from ${modpackName}`);
      onDeleted?.();
      rootAlertDialogHandle.close();
    } catch (e) {
      toast.error(`Failed to delete: ${e as Error}`);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <AlertDialogHeader>
        <AlertDialogTitle>Delete version</AlertDialogTitle>
        <AlertDialogDescription>
          This will permanently delete version <strong>v{version}</strong> from{" "}
          <strong>{modpackName}</strong>. This action cannot be undone.
        </AlertDialogDescription>
      </AlertDialogHeader>

      <div className="flex flex-col gap-2 px-6">
        <Label htmlFor="confirm-version">
          Type
          <Group className="flex items-center">
            <code className="bg-muted rounded px-1 font-mono text-xs">{version}</code>
            <GroupSeparator />
            <Button
              aria-label="Copy version"
              onClick={() => copy(version)}
              size="icon-xs"
              variant="outline"
            >
              <CopyIcon className="size-3" />
            </Button>
          </Group>{" "}
          to confirm
        </Label>
        <Input
          autoFocus
          className="flex-1"
          id="confirm-version"
          onChange={(e) => setConfirmText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && canDelete) void handleDelete();
          }}
          placeholder={version}
          value={confirmText}
        />
      </div>

      <AlertDialogFooter>
        <AlertDialogClose disabled={deleting} render={<Button variant="outline" />}>
          Cancel
        </AlertDialogClose>
        <Button disabled={!canDelete || deleting} onClick={handleDelete} variant="destructive">
          {deleting ? "Deleting…" : "Delete version"}
        </Button>
      </AlertDialogFooter>
    </>
  );
}
