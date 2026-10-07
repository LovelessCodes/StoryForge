import {
  Check,
  ChevronsUpDown,
  Download,
  ShieldCheck,
  UserPlus,
  UserRound,
  UserX,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useVerifyAuth } from "@/hooks/use-verify-auth";
import { toast } from "@/lib/notify";
import { useAccountStore } from "@/stores/accounts";

import AddAccountSheet from "./AddAccountSheet";
import ImportLoginsSheet from "./ImportLoginsSheet";

/**
 * Vintage Story account switcher (game accounts, separate from the optional
 * cloud account used for modpacks).
 */
export default function AccountMenu() {
  const { t } = useTranslation();
  const { users, selectedUser, setSelectedUser, removeUser } = useAccountStore();
  const verify = useVerifyAuth();
  const [addOpen, setAddOpen] = useState(false);
  /** Bumped per open so the sheet remounts with a clean form. */
  const [addSession, setAddSession] = useState(0);
  const [importOpen, setImportOpen] = useState(false);

  function verifySelected() {
    if (!selectedUser?.uid || !selectedUser.sessionkey) {
      toast.error(t("auth.menu.noSavedSession"));
      return;
    }
    verify.mutate(
      { uid: selectedUser.uid, sessionkey: selectedUser.sessionkey },
      {
        onError: (error: Error) => {
          if (error.message.includes("invalid_session")) {
            toast.error(t("auth.menu.sessionExpired"));
            removeUser(selectedUser.uid);
          } else {
            toast.error(t("auth.menu.verifyFailed", { message: error.message }));
          }
        },
        onSuccess: () => toast.success(t("auth.menu.sessionValid")),
      },
    );
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="outline"
              className="group/trigger w-full justify-between font-normal"
            />
          }
        >
          <span className="flex min-w-0 items-center gap-2">
            <UserRound className="text-muted-foreground size-4 shrink-0" />
            <span className="truncate">{selectedUser?.playername ?? t("auth.actions.signIn")}</span>
          </span>
          <ChevronsUpDown className="text-muted-foreground size-4 shrink-0" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-56">
          <DropdownMenuGroup>
            <DropdownMenuLabel>{t("auth.menu.label")}</DropdownMenuLabel>
            {users.length === 0 && (
              <DropdownMenuItem disabled>{t("auth.menu.empty")}</DropdownMenuItem>
            )}
            {users.map((user) => (
              <DropdownMenuItem
                key={user.uid ?? user.email}
                onClick={() => setSelectedUser(user.uid)}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{user.playername ?? user.email}</span>
                  <span className="text-muted-foreground block text-[10px]">{user.email}</span>
                </span>
                {selectedUser?.uid === user.uid && <Check className="size-3.5 shrink-0" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          {selectedUser && (
            <>
              <DropdownMenuItem disabled={verify.isPending} onClick={verifySelected}>
                <ShieldCheck /> {t("auth.actions.verifySession")}
              </DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onClick={() => removeUser(selectedUser.uid)}>
                <UserX /> {t("auth.actions.signOut")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}
          <DropdownMenuItem
            onClick={() => {
              setAddSession((session) => session + 1);
              setAddOpen(true);
            }}
          >
            <UserPlus /> {t("auth.actions.addAccount")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setImportOpen(true)}>
            <Download /> {t("auth.actions.importLogins")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Remount on every open so the form starts clean (no reset effect). */}
      <AddAccountSheet key={addSession} open={addOpen} onOpenChange={setAddOpen} />
      <ImportLoginsSheet open={importOpen} onOpenChange={setImportOpen} />
    </>
  );
}
