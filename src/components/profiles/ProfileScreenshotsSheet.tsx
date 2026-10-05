import { invoke } from "@tauri-apps/api/core";
import { Camera, FolderOpen, Loader2, X } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  type ScreenshotInfo,
  useProfileScreenshots,
  useScreenshotFull,
  useScreenshotImage,
} from "@/hooks/use-screenshots";
import type { Profile } from "@/stores/profiles";

/** Browse the PNGs in a profile's `Screenshots/` folder. */
export default function ProfileScreenshotsSheet({
  open,
  onOpenChange,
  profile,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profile: Profile;
}) {
  const { t } = useTranslation();
  const { data: screenshots, isPending } = useProfileScreenshots(profile.id, { enabled: open });
  const [selected, setSelected] = useState<ScreenshotInfo | null>(null);

  // Reset the viewer every time the sheet opens.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setSelected(null);
  }

  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent side="right" className="relative w-full gap-0 p-0 sm:max-w-2xl">
        <SheetHeader className="border-b">
          <SheetTitle>{t("profiles.screenshots.title", { name: profile.name })}</SheetTitle>
          <SheetDescription>{t("profiles.screenshots.description")}</SheetDescription>
        </SheetHeader>
        <ScrollArea scrollFade className="min-h-0 flex-1">
          <div className="p-4">
            {isPending ? (
              <p className="text-muted-foreground text-sm">…</p>
            ) : screenshots && screenshots.length > 0 ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {screenshots.map((shot) => (
                  <ScreenshotThumb key={shot.path} onOpen={() => setSelected(shot)} shot={shot} />
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center gap-3 border border-dashed p-10 text-center">
                <Camera className="text-muted-foreground size-6" />
                <p className="text-muted-foreground text-xs">{t("profiles.screenshots.empty")}</p>
              </div>
            )}
          </div>
        </ScrollArea>

        {selected && <FullScreenshot onClose={() => setSelected(null)} shot={selected} />}
      </SheetContent>
    </Sheet>
  );
}

function ScreenshotThumb({ shot, onOpen }: { shot: ScreenshotInfo; onOpen: () => void }) {
  const image = useScreenshotImage(shot.path, 400);
  return (
    <div className="grid min-w-0 gap-1.5">
      <button
        className="group bg-muted/30 focus-visible:ring-ring block aspect-video w-full overflow-hidden border focus-visible:ring-2 focus-visible:outline-none"
        onClick={onOpen}
        type="button"
      >
        {image.data ? (
          <img
            alt={shot.name}
            className="h-full w-full object-cover transition-transform group-hover:scale-[1.02]"
            src={image.data}
          />
        ) : (
          <span className="text-muted-foreground grid h-full place-items-center text-[11px]">
            …
          </span>
        )}
      </button>
      <span className="text-muted-foreground truncate font-mono text-[10px]" title={shot.name}>
        {shot.name}
      </span>
    </div>
  );
}

function FullScreenshot({ shot, onClose }: { shot: ScreenshotInfo; onClose: () => void }) {
  const { t } = useTranslation();
  const image = useScreenshotFull(shot.path);
  return (
    <div className="bg-background absolute inset-0 z-50 flex flex-col">
      <div className="flex items-center justify-between gap-2 border-b p-3">
        <span className="min-w-0 truncate font-mono text-xs">{shot.name}</span>
        <div className="flex shrink-0 gap-1">
          <Button
            aria-label={t("profiles.screenshots.reveal")}
            onClick={() => void invoke("reveal_in_file_explorer", { path: shot.path })}
            size="icon-sm"
            title={t("profiles.screenshots.reveal")}
            variant="ghost"
          >
            <FolderOpen />
          </Button>
          <Button
            aria-label={t("profiles.screenshots.close")}
            onClick={onClose}
            size="icon-sm"
            title={t("profiles.screenshots.close")}
            variant="ghost"
          >
            <X />
          </Button>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center p-3">
        {image.data ? (
          <img alt={shot.name} className="max-h-full max-w-full object-contain" src={image.data} />
        ) : (
          <Loader2 className="text-muted-foreground animate-spin" />
        )}
      </div>
    </div>
  );
}
