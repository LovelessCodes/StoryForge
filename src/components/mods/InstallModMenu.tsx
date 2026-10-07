import { open } from "@tauri-apps/plugin-dialog";
import { ChevronDown, FileUp, Link2, Loader2, PackagePlus } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useInstallModFile, useInstallModUrl } from "@/hooks/use-install-mod";

/**
 * Install a mod that the ModDB browser cannot offer: a local `.zip` (private or
 * work-in-progress mods) or a direct download link (a ModDB release link for a
 * mod that is not listed yet, or any host). Both paths verify the archive
 * carries a `modinfo.json` before it lands in the profile.
 */
export function InstallModMenu({ modsDirectory }: { modsDirectory?: string }) {
  const { t } = useTranslation();
  const [urlOpen, setUrlOpen] = useState(false);
  const [url, setUrl] = useState("");
  const fileInstall = useInstallModFile(modsDirectory);
  const urlInstall = useInstallModUrl(modsDirectory);
  const busy = fileInstall.isPending || urlInstall.isPending;

  async function pickFile() {
    if (!modsDirectory) return;
    const path = await open({
      filters: [{ name: t("mods.installFrom.zipFilter"), extensions: ["zip"] }],
      multiple: false,
    });
    if (typeof path !== "string") return;
    fileInstall.mutate(path);
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button disabled={!modsDirectory || busy} size="sm" variant="outline" />}
        >
          {busy ? <Loader2 className="animate-spin" /> : <PackagePlus />}
          <span className="hidden sm:inline">{t("mods.installFrom.button")}</span>
          <ChevronDown className="size-3" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem className="text-nowrap" onClick={() => void pickFile()}>
            <FileUp /> {t("mods.installFrom.file")}
          </DropdownMenuItem>
          <DropdownMenuItem className="text-nowrap" onClick={() => setUrlOpen(true)}>
            <Link2 /> {t("mods.installFrom.url")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Sheet
        open={urlOpen}
        onOpenChange={(next) => {
          if (!urlInstall.isPending) setUrlOpen(next);
        }}
      >
        <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-sm">
          <SheetHeader className="border-b">
            <SheetTitle>{t("mods.installFrom.urlTitle")}</SheetTitle>
            <SheetDescription>{t("mods.installFrom.urlDescription")}</SheetDescription>
          </SheetHeader>
          <div className="grid gap-1.5 p-4">
            <Input
              aria-label={t("mods.installFrom.urlPlaceholder")}
              placeholder={t("mods.installFrom.urlPlaceholder")}
              value={url}
              onChange={(event) => setUrl(event.target.value)}
            />
          </div>
          <SheetFooter className="border-t">
            <Button
              disabled={url.trim().length === 0 || urlInstall.isPending}
              variant="accent-primary"
              onClick={() =>
                urlInstall.mutate(url.trim(), {
                  onSuccess: () => {
                    setUrl("");
                    setUrlOpen(false);
                  },
                })
              }
            >
              {urlInstall.isPending && <Loader2 className="animate-spin" />}
              {t("mods.installFrom.submit")}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
}
