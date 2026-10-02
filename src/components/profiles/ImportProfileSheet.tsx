import { useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { open as openFileDialog } from "@tauri-apps/plugin-dialog";
import { FileUp, Link2 } from "lucide-react";
import { useRef, useState } from "react";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { useDownloadVersion } from "@/hooks/use-download-version";
import {
  installedVersionsQueryKey,
  useInstalledVersionNames,
} from "@/hooks/use-installed-versions";
import { makeStringFolderSafe } from "@/lib/helpers";
import { toast } from "@/lib/notify";
import { useProfilesStore } from "@/stores/profiles";
import { useSettingsStore } from "@/stores/settings";

const importSchema = z.object({
  name: z.string().min(2).max(100),
  version: z.string().min(2).max(100),
  startParams: z.string().optional().default(""),
  mods: z
    .union([z.array(z.object({ id: z.string(), version: z.string() })), z.string()])
    .optional(),
  modpackSlug: z.string().nullish(),
  modpackVersion: z.string().nullish(),
});

type ProfileImportResult = {
  id: number;
  name: string;
};

type ImportProgress = { current: number; total: number; modid: string; version: string };

interface ImportProfileSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function ImportProfileSheet({ open, onOpenChange }: ImportProfileSheetProps) {
  const queryClient = useQueryClient();
  const { loadProfiles } = useProfilesStore();
  const setActiveProfileId = useSettingsStore((s) => s.setActiveProfileId);
  const installedNames = useInstalledVersionNames();
  const { mutateAsync: downloadVersion } = useDownloadVersion();

  const [text, setText] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const listenRef = useRef<UnlistenFn | null>(null);

  async function chooseFile() {
    const path = await openFileDialog({
      multiple: false,
      filters: [{ name: "Profile export", extensions: ["json"] }],
    });
    if (typeof path !== "string") return;
    try {
      const json = await invoke<string>("read_profile_file", { path });
      setText(json);
    } catch (error) {
      toast.error("Failed to read export file", { description: String(error) });
    }
  }

  async function submit() {
    const raw = text.trim();
    if (!raw) return;

    try {
      let json = raw;
      if (raw.startsWith("SF1.")) {
        setBusy("Decoding share code…");
        json = await invoke<string>("import_profile_code", { code: raw });
      }
      const normalized = json.replace(/[\u201C\u201D]/g, '"').replace(/[\u2018\u2019]/g, "'");
      const parsed = importSchema.safeParse(JSON.parse(normalized));
      if (!parsed.success) {
        toast.error("That does not look like a profile export");
        setBusy(null);
        return;
      }

      const { name, version, startParams, mods, modpackSlug, modpackVersion } = parsed.data;
      const modsString =
        typeof mods === "string" ? mods : (mods ?? []).map((m) => `${m.id}@${m.version}`).join(",");

      if (!installedNames.includes(version)) {
        setBusy(`Downloading game version ${version}…`);
        await downloadVersion(version);
      }

      const emitevent = `import-profile-${Date.now()}`;
      listenRef.current?.();
      listenRef.current = await listen<{
        phase: string;
        current: number;
        total: number;
        modid: string;
        version: string;
      }>(emitevent, (event) => {
        if (event.payload.phase === "downloading") {
          setProgress({
            current: event.payload.current,
            modid: event.payload.modid,
            total: event.payload.total,
            version: event.payload.version,
          });
        }
      });

      setBusy(`Importing "${name}"…`);
      const result = await invoke<ProfileImportResult>("import_profile", {
        params: {
          emitevent,
          modConfigUrl: null,
          modpackSlug: modpackSlug ?? null,
          modpackVersion: modpackVersion ?? null,
          mods: modsString,
          name,
          safeName: makeStringFolderSafe(name),
          startParams,
          version,
        },
      });

      listenRef.current?.();
      listenRef.current = null;
      setProgress(null);
      await loadProfiles();
      setActiveProfileId(result.id);
      void queryClient.invalidateQueries({ queryKey: installedVersionsQueryKey() });
      onOpenChange(false);
      setText("");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error("Import failed", { description: message });
    } finally {
      listenRef.current?.();
      listenRef.current = null;
      setBusy(null);
      setProgress(null);
    }
  }

  return (
    <Sheet open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b">
          <SheetTitle>Import a profile</SheetTitle>
          <SheetDescription>
            Paste a share code or exported JSON, or pick an exported file. Mods are downloaded
            automatically.
          </SheetDescription>
        </SheetHeader>

        <ScrollArea scrollFade className="min-h-0 flex-1">
          <div className="grid gap-3 p-4">
            <Textarea
              aria-label="Profile export"
              className="min-h-48 resize-none font-mono text-[11px]"
              disabled={busy !== null}
              placeholder={"SF1.… share code, or profile JSON export"}
              value={text}
              onChange={(event) => setText(event.target.value)}
            />
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={busy !== null}
                onClick={() => void chooseFile()}
              >
                <FileUp /> Choose file…
              </Button>
              <span className="text-muted-foreground flex items-center gap-1 text-[11px]">
                <Link2 className="size-3" /> Share codes start with SF1.
              </span>
            </div>

            {progress && progress.total > 0 && (
              <div className="grid gap-1">
                <p className="text-muted-foreground text-xs">
                  Downloading mod {progress.current} of {progress.total}:{" "}
                  <span className="text-foreground font-medium">{progress.modid}</span>
                  <span className="text-muted-foreground">@{progress.version}</span>
                </p>
                <Progress value={Math.round((progress.current / progress.total) * 100)} />
              </div>
            )}
          </div>
        </ScrollArea>

        <SheetFooter className="border-t">
          <Button
            variant="accent-primary"
            disabled={busy !== null || text.trim() === ""}
            onClick={() => void submit()}
          >
            {busy ?? "Import profile"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
