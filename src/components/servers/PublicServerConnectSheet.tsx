import { Plug } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { useConnectToServer } from "@/hooks/use-connect-to-server";
import type { PublicServer } from "@/hooks/use-public-servers";
import { useProfiles } from "@/stores/profiles";

interface PublicServerConnectSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Fires after the close animation finishes (the parent clears its state). */
  onOpenChangeComplete?: (open: boolean) => void;
  server: PublicServer | null;
}

/** Pick a matching profile, optionally enter the server password, then launch. */
export default function PublicServerConnectSheet({
  open,
  onOpenChange,
  onOpenChangeComplete,
  server,
}: PublicServerConnectSheetProps) {
  const { t } = useTranslation();
  const { profiles } = useProfiles();
  const connectToServer = useConnectToServer();
  const [password, setPassword] = useState("");
  const [selectedProfileId, setSelectedProfileId] = useState<number | null>(null);

  // Reset the form every time the sheet opens (render-time reset keeps the
  // previous server's password/profile from leaking into the next one).
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setPassword("");
      setSelectedProfileId(null);
    }
  }

  const matchingProfiles = profiles.filter((p) => p.version === server?.gameVersion);
  const selectedProfile = matchingProfiles.find((p) => p.id === selectedProfileId);

  function connect() {
    if (!server || selectedProfile === undefined) return;
    connectToServer.mutate(
      {
        name: server.serverName,
        ip: server.serverIP,
        password,
        profileId: selectedProfile.id,
        pub: true,
      },
      {
        onSuccess: () => {
          onOpenChange(false);
          setPassword("");
          setSelectedProfileId(null);
        },
      },
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange} onOpenChangeComplete={onOpenChangeComplete}>
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b">
          <SheetTitle>{t("servers.connect.title", { name: server?.serverName ?? "" })}</SheetTitle>
          <SheetDescription>
            {t("servers.connect.description", { ip: server?.serverIP ?? "" })}
          </SheetDescription>
        </SheetHeader>

        <div className="grid gap-4 p-4">
          <div className="grid gap-1.5">
            <span className="text-xs font-medium">{t("servers.profile")}</span>
            {matchingProfiles.length === 0 ? (
              <p className="text-muted-foreground text-xs">
                {t("servers.connect.noProfile", { version: server?.gameVersion ?? "" })}
              </p>
            ) : (
              <Select
                items={matchingProfiles.map((p) => ({ label: p.name, value: String(p.id) }))}
                value={selectedProfileId === null ? "" : String(selectedProfileId)}
                onValueChange={(value) => value && setSelectedProfileId(Number(value))}
              >
                <SelectTrigger className="w-full" aria-label={t("servers.profile")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {matchingProfiles.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {server?.hasPassword && (
            <div className="grid gap-1.5">
              <label className="text-xs font-medium" htmlFor="public-server-password">
                {t("servers.connect.serverPassword")}
              </label>
              <Input
                id="public-server-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>
          )}
        </div>

        <SheetFooter className="border-t">
          <Button
            variant="accent-primary"
            disabled={selectedProfile === undefined || connectToServer.isPending}
            onClick={connect}
          >
            <Plug />{" "}
            {connectToServer.isPending
              ? t("servers.connect.connecting")
              : t("servers.actions.connect")}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
