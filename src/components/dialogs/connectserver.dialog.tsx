import { useState } from "react";

import { PasswordInput } from "@/components/inputs/password.input";
import {
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { rootAlertDialogHandle } from "@/handles";
import { useConnectToServer } from "@/hooks/use-connect-to-server";
import type { PublicServer } from "@/hooks/use-public-servers";
import { useInstallations } from "@/stores/installations";

export type ConnectServerDialogProps = {
  server: PublicServer;
};

export function ConnectServerDialog({ server }: ConnectServerDialogProps) {
  const [password, setPassword] = useState("");
  const { installations } = useInstallations();
  const { mutate: connectToServer } = useConnectToServer();
  const [selectedInstallation, setSelectedInstallation] = useState<number | null>(null);

  return (
    <>
      <AlertDialogHeader>
        <AlertDialogTitle>Pick an installation to connect to {server?.serverIP}</AlertDialogTitle>
        <AlertDialogDescription>
          This will open Vintage Story and connect to the server.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <div className="flex w-full flex-col gap-2">
        <Select
          onValueChange={(value) => setSelectedInstallation(Number(value))}
          value={selectedInstallation?.toString() || undefined}
        >
          <SelectTrigger className="w-full">
            {installations.find((i) => i.id === selectedInstallation)?.name ||
              "Select an installation"}
          </SelectTrigger>
          <SelectContent alignItemWithTrigger={false}>
            {installations.flatMap((i) =>
              i.version === server.gameVersion
                ? [
                    <SelectItem key={i.id} value={i.id.toString()}>
                      {i.name}
                    </SelectItem>,
                  ]
                : [],
            )}
          </SelectContent>
        </Select>
        {server.hasPassword && (
          <PasswordInput
            className="mt-4"
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Server Password"
            value={password}
          />
        )}
      </div>
      <AlertDialogFooter>
        <Button onClick={() => rootAlertDialogHandle.close()} variant="outline">
          Cancel
        </Button>
        <Button
          disabled={selectedInstallation === null}
          onClick={() => {
            if (selectedInstallation === null) return;
            connectToServer({
              installationId: selectedInstallation,
              ip: server.serverIP,
              name: server.serverName,
              password,
              pub: true,
            });
            rootAlertDialogHandle.close();
          }}
        >
          Connect
        </Button>
      </AlertDialogFooter>
    </>
  );
}
