import { useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { open as openFileDialog } from "@tauri-apps/plugin-dialog";
import { FolderSearch } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { installedVersionsQueryKey } from "@/hooks/use-installed-versions";
import { linkableVersionsQueryKey } from "@/hooks/use-linkable-versions";
import { pathBasename } from "@/lib/helpers";
import type { LinkVersionsReport } from "@/lib/types";

interface LinkExistingVersionSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Manually link a game install that Story Forge cannot detect (another drive,
 * the stock launcher, a manually extracted zip…).
 */
export default function LinkExistingVersionSheet({
  open,
  onOpenChange,
}: LinkExistingVersionSheetProps) {
  const queryClient = useQueryClient();
  const [path, setPath] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function browse() {
    const selected = await openFileDialog({
      directory: true,
      multiple: false,
      title: "Select a Vintage Story installation folder",
    });
    if (typeof selected !== "string") return;
    setPath(selected);
    if (!name.trim()) setName(pathBasename(selected));
    setError(null);
  }

  async function link() {
    setBusy(true);
    setError(null);
    try {
      const result = await invoke<LinkVersionsReport>("link_external_versions", {
        versions: [{ name: name.trim(), path: path.trim(), source: null }],
      });
      if (result.linked === 0) {
        setError(result.skipped[0]?.reason ?? "Could not link that folder");
        return;
      }
      await queryClient.invalidateQueries({ queryKey: installedVersionsQueryKey() });
      await queryClient.invalidateQueries({ queryKey: linkableVersionsQueryKey });
      onOpenChange(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b">
          <SheetTitle>Link an existing version</SheetTitle>
          <SheetDescription>
            Point Story Forge at a Vintage Story install folder. The folder is registered in place —
            nothing is copied or moved.
          </SheetDescription>
        </SheetHeader>

        <ScrollArea scrollFade className="min-h-0 flex-1">
          <div className="grid gap-4 p-4">
            <div className="grid gap-1.5">
              <span className="text-xs font-medium">Install folder</span>
              <div className="flex items-center gap-2">
                <Input className="font-mono text-[11px]" placeholder="…" readOnly value={path} />
                <Button variant="outline" onClick={() => void browse()}>
                  <FolderSearch /> Browse
                </Button>
              </div>
              <p className="text-muted-foreground text-[11px]">
                The folder should contain the game files (Vintagestory, Vintagestory.exe or Vintage
                Story.app).
              </p>
            </div>
            <div className="grid gap-1.5">
              <span className="text-xs font-medium">Version name</span>
              <Input
                className="font-mono"
                placeholder="1.21.3"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
              <p className="text-muted-foreground text-[11px]">
                Used when choosing a version for a profile; the folder name is a good default.
              </p>
            </div>
            {error && <p className="text-destructive text-xs">{error}</p>}
          </div>
        </ScrollArea>

        <SheetFooter className="border-t">
          <Button
            variant="accent-primary"
            disabled={busy || !path.trim() || !name.trim()}
            onClick={() => void link()}
          >
            {busy ? "Linking…" : "Link version"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
