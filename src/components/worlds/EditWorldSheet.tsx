import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useUpdateWorld } from "@/hooks/use-update-world";
import { pathBasename } from "@/lib/helpers";
import { toast } from "@/lib/notify";
import type { World } from "@/lib/types";
import type { Profile } from "@/stores/profiles";

interface EditWorldSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  world: World;
  profiles: Profile[];
}

export default function EditWorldSheet({
  open,
  onOpenChange,
  world,
  profiles,
}: EditWorldSheetProps) {
  const { t } = useTranslation();
  const matchedProfileId = profiles.find(
    (profile) => pathBasename(profile.path) === world.profile_name,
  )?.id;

  const [name, setName] = useState(world.data.world_name);
  const [profileId, setProfileId] = useState(matchedProfileId ? String(matchedProfileId) : "");
  const [error, setError] = useState<string | null>(null);

  // Reset the form every time the sheet opens. Adjusting state during render
  // (rather than in an effect) avoids a frame with stale values.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setName(world.data.world_name);
      setProfileId(matchedProfileId ? String(matchedProfileId) : "");
      setError(null);
    }
  }

  const update = useUpdateWorld({
    onError: (err) => {
      setError(err.message);
      toast.error(t("worlds.edit.failed"), { description: err.message });
    },
    onSuccess: () => {
      onOpenChange(false);
    },
  });

  function submit() {
    const trimmed = name.trim();
    if (trimmed.length < 2 || trimmed.length > 100) {
      setError(t("worlds.edit.errors.nameLength"));
      return;
    }
    const id = Number(profileId);
    if (!profileId || !Number.isInteger(id)) {
      setError(t("worlds.edit.errors.profile"));
      return;
    }
    setError(null);
    update.mutate({
      identifier: world.data.savegame_identifier,
      name: trimmed,
      profileId: id,
      worldPath: world.path,
    });
  }

  const profileItems = profiles.map((profile) => ({
    label: profile.name,
    value: String(profile.id),
  }));

  return (
    <Sheet open={open} onOpenChange={(next) => !update.isPending && onOpenChange(next)}>
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b">
          <SheetTitle>{t("worlds.edit.title", { name: world.data.world_name })}</SheetTitle>
          <SheetDescription>{t("worlds.edit.description")}</SheetDescription>
        </SheetHeader>

        <ScrollArea scrollFade className="min-h-0 flex-1">
          <div className="grid gap-4 p-4">
            <div className="grid gap-1.5">
              <label className="text-xs font-medium" htmlFor="world-name">
                {t("common.fields.name")}
              </label>
              <Input
                id="world-name"
                placeholder={t("worlds.edit.namePlaceholder")}
                value={name}
                onChange={(event) => setName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    submit();
                  }
                }}
              />
            </div>

            <div className="grid gap-1.5">
              <span className="text-xs font-medium">{t("worlds.edit.profile")}</span>
              <Select
                items={profileItems}
                value={profileId}
                onValueChange={(value) => setProfileId(value ?? "")}
              >
                <SelectTrigger className="w-full" aria-label={t("worlds.edit.profile")}>
                  <SelectValue placeholder={t("worlds.edit.selectProfile")} />
                </SelectTrigger>
                <SelectContent>
                  {profileItems.map((profile) => (
                    <SelectItem key={profile.value} value={profile.value}>
                      {profile.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-muted-foreground text-[11px]">{t("worlds.edit.moveHint")}</p>
            </div>

            {error && <p className="text-destructive text-xs">{error}</p>}
          </div>
        </ScrollArea>

        <SheetFooter className="border-t">
          <Button variant="accent-primary" disabled={update.isPending} onClick={submit}>
            {update.isPending ? t("worlds.edit.saving") : t("worlds.edit.submit")}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
