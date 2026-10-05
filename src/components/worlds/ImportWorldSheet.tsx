import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { FileUp, Loader2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useImportWorld } from "@/hooks/use-world-ops";
import { pathBasename } from "@/lib/helpers";
import { toast } from "@/lib/notify";
import type { Profile } from "@/stores/profiles";

interface ImportWorldSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profiles: Profile[];
}

/** Import a `.vcdbs` save or a Story Forge world `.zip` into a profile. */
export default function ImportWorldSheet({ open, onOpenChange, profiles }: ImportWorldSheetProps) {
  const { t } = useTranslation();
  const [sourcePath, setSourcePath] = useState<string | null>(null);
  const [profileId, setProfileId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Reset the form every time the sheet opens.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setSourcePath(null);
      setProfileId(null);
      setError(null);
    }
  }

  const importWorld = useImportWorld({
    onError: (err) => {
      setError(err.message);
      toast.error(t("worlds.import.failed"), { description: err.message });
    },
    onSuccess: () => {
      toast.success(t("worlds.import.imported"));
      onOpenChange(false);
    },
  });

  async function pickFile() {
    const path = await openDialog({
      multiple: false,
      filters: [{ name: t("worlds.import.filterName"), extensions: ["vcdbs", "zip"] }],
    });
    if (!path || Array.isArray(path)) return;
    setSourcePath(path);
  }

  function submit() {
    if (!sourcePath || profileId === null) return;
    importWorld.mutate({ profileId, sourcePath });
  }

  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b">
          <SheetTitle>{t("worlds.import.title")}</SheetTitle>
          <SheetDescription>{t("worlds.import.description")}</SheetDescription>
        </SheetHeader>
        <ScrollArea scrollFade className="min-h-0 flex-1">
          <div className="grid gap-4 p-4">
            <div className="grid gap-1.5">
              <span className="text-xs font-medium">{t("worlds.import.fileLabel")}</span>
              <div className="flex items-center gap-2">
                <Button onClick={() => void pickFile()} size="sm" variant="outline">
                  <FileUp /> {t("worlds.import.chooseFile")}
                </Button>
                <span className="text-muted-foreground min-w-0 flex-1 truncate font-mono text-[11px]">
                  {sourcePath ? pathBasename(sourcePath) : t("worlds.import.noFile")}
                </span>
              </div>
            </div>

            <div className="grid gap-1.5">
              <span className="text-xs font-medium">{t("worlds.import.profileLabel")}</span>
              <Select
                items={profiles.map((profile) => ({
                  label: profile.name,
                  value: String(profile.id),
                }))}
                value={profileId === null ? "" : String(profileId)}
                onValueChange={(value) => {
                  if (value) setProfileId(Number(value));
                }}
              >
                <SelectTrigger className="w-full" aria-label={t("worlds.import.profileLabel")}>
                  <SelectValue placeholder={t("worlds.import.profilePlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  {profiles.map((profile) => (
                    <SelectItem key={profile.id} value={String(profile.id)}>
                      {profile.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {error && <p className="text-destructive text-[11px]">{error}</p>}
          </div>
        </ScrollArea>
        <SheetFooter className="border-t">
          <div className="flex justify-end gap-2">
            <SheetClose render={<Button disabled={importWorld.isPending} variant="outline" />}>
              {t("common.actions.cancel")}
            </SheetClose>
            <Button
              disabled={!sourcePath || profileId === null || importWorld.isPending}
              onClick={submit}
              variant="accent-primary"
            >
              {importWorld.isPending && <Loader2 className="animate-spin" />}
              {t("worlds.import.submit")}
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
