import { Loader2 } from "lucide-react";
import { useState } from "react";
import { Trans, useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useDuplicateWorld } from "@/hooks/use-world-ops";
import { pathBasename } from "@/lib/helpers";
import { toast } from "@/lib/notify";
import type { World } from "@/lib/types";
import type { Profile } from "@/stores/profiles";

interface DuplicateWorldSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  world: World;
  profiles: Profile[];
}

/** Copy a world under a new name, with a fresh save id. */
export default function DuplicateWorldSheet({
  open,
  onOpenChange,
  world,
  profiles,
}: DuplicateWorldSheetProps) {
  const { t } = useTranslation();
  const profile = profiles.find((entry) => pathBasename(entry.path) === world.profile_name);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Reset the form every time the sheet opens.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setName(`${world.data.world_name} copy`);
      setError(null);
    }
  }

  const duplicate = useDuplicateWorld({
    onError: (err) => {
      setError(err.message);
      toast.error(t("worlds.duplicate.failed"), { description: err.message });
    },
    onSuccess: () => {
      toast.success(t("worlds.duplicate.done", { name: name.trim() }));
      onOpenChange(false);
    },
  });

  function submit() {
    if (!profile) return;
    const trimmed = name.trim();
    if (trimmed.length < 2 || trimmed.length > 100) {
      setError(t("worlds.edit.errors.nameLength"));
      return;
    }
    duplicate.mutate({ profileId: profile.id, worldPath: world.path, name: trimmed });
  }

  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b">
          <SheetTitle>
            <Trans
              components={{ name: <span className="text-accent-amber" /> }}
              i18nKey="worlds.duplicate.title"
              values={{ name: world.data.world_name }}
            />
          </SheetTitle>
          <SheetDescription>{t("worlds.duplicate.description")}</SheetDescription>
        </SheetHeader>
        <ScrollArea scrollFade className="min-h-0 flex-1">
          <div className="grid gap-4 p-4">
            {!profile && (
              <p className="text-destructive text-xs">{t("worlds.duplicate.noProfile")}</p>
            )}
            <div className="grid gap-1.5">
              <label className="text-xs font-medium" htmlFor="duplicate-world-name">
                {t("worlds.duplicate.nameLabel")}
              </label>
              <Input
                id="duplicate-world-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
              {error && <p className="text-destructive text-[11px]">{error}</p>}
            </div>
          </div>
        </ScrollArea>
        <SheetFooter className="border-t">
          <div className="flex justify-end gap-2">
            <SheetClose render={<Button disabled={duplicate.isPending} variant="outline" />}>
              {t("common.actions.cancel")}
            </SheetClose>
            <Button
              disabled={!profile || duplicate.isPending}
              onClick={submit}
              variant="accent-primary"
            >
              {duplicate.isPending && <Loader2 className="animate-spin" />}
              {t("worlds.duplicate.submit")}
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
