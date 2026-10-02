import { Link } from "@tanstack/react-router";
import { CloudIcon, LogOutIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuthSession } from "@/hooks/use-auth-session";
import { authClient, clearAuthToken } from "@/lib/auth";
import { toast } from "@/lib/notify";

async function handleSignOut() {
  try {
    const { error } = await authClient.signOut();
    if (error) throw new Error(error.message ?? "Sign out failed");
    clearAuthToken();
  } catch {
    toast.error("Failed to sign out");
  }
}

function InfoRow({ label, value }: { label: string; value: string | undefined }) {
  return (
    <div className="grid gap-1">
      <span className="text-muted-foreground text-[10px] font-medium tracking-widest uppercase">
        {label}
      </span>
      <p className="text-xs font-medium break-all">{value ?? "Not set"}</p>
    </div>
  );
}

/** Optional cloud account card. Everything local works without signing in. */
export default function AccountCard() {
  const { user, isLoading } = useAuthSession();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CloudIcon className="size-4" />
          Account
        </CardTitle>
        <CardDescription>
          Optional. Signing in enables cloud modpacks and profile sharing; profiles, mods and worlds
          work fully offline.
        </CardDescription>
      </CardHeader>

      <CardContent>
        {isLoading ? (
          <div className="grid gap-3">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-4 w-56" />
          </div>
        ) : !user ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-muted-foreground text-xs">You are not signed in.</p>
            <Button render={<Link to="/auth" />} size="sm" variant="outline">
              Sign in
            </Button>
          </div>
        ) : (
          <div className="grid gap-3">
            <InfoRow label="Name" value={user.name} />
            <Separator />
            <InfoRow label="Email" value={user.email} />
            <Separator />
            <div className="grid gap-1">
              <span className="text-muted-foreground text-[10px] font-medium tracking-widest uppercase">
                User ID
              </span>
              <p className="text-muted-foreground font-mono text-[11px] break-all">{user.id}</p>
            </div>
            <div className="pt-1">
              <Button onClick={() => void handleSignOut()} size="sm" variant="destructive">
                <LogOutIcon /> Sign out
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
