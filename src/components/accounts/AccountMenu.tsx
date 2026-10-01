import { Check, ChevronsUpDown, ShieldCheck, UserPlus, UserRound, UserX } from "lucide-react";
import { useState } from "react";

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

/**
 * Vintage Story account switcher (game accounts, separate from the optional
 * cloud account used for modpacks).
 */
export default function AccountMenu() {
  const { users, selectedUser, setSelectedUser, removeUser } = useAccountStore();
  const verify = useVerifyAuth();
  const [addOpen, setAddOpen] = useState(false);

  function verifySelected() {
    if (!selectedUser?.uid || !selectedUser.sessionkey) {
      toast.error("This account has no saved session — sign in again.");
      return;
    }
    verify.mutate(
      { uid: selectedUser.uid, sessionkey: selectedUser.sessionkey },
      {
        onError: (error: Error) => {
          if (error.message.includes("invalid_session")) {
            toast.error("Session expired — please sign in again.");
            removeUser(selectedUser.uid);
          } else {
            toast.error(`Could not verify session: ${error.message}`);
          }
        },
        onSuccess: () => toast.success("Session is valid"),
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
            <span className="truncate">{selectedUser?.playername ?? "Sign in"}</span>
          </span>
          <ChevronsUpDown className="text-muted-foreground size-4 shrink-0" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-56">
          <DropdownMenuGroup>
            <DropdownMenuLabel>Vintage Story accounts</DropdownMenuLabel>
            {users.length === 0 && (
              <DropdownMenuItem disabled>No accounts signed in</DropdownMenuItem>
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
                <ShieldCheck /> Verify session
              </DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onClick={() => removeUser(selectedUser.uid)}>
                <UserX /> Sign out
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}
          <DropdownMenuItem onClick={() => setAddOpen(true)}>
            <UserPlus /> Add account…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Remount on every open so the form starts clean (no reset effect). */}
      <AddAccountSheet key={addOpen ? "open" : "closed"} open={addOpen} onOpenChange={setAddOpen} />
    </>
  );
}
