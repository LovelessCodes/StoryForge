import { Link } from "@tanstack/react-router";
import { LogOutIcon, UserIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useAuthSession } from "@/hooks/use-auth-session";
import { authClient, clearAuthToken } from "@/lib/auth";

async function handleAccountSignOut() {
  try {
    await authClient.signOut();
    clearAuthToken();
    toast.success("Signed out");
  } catch {
    toast.error("Failed to sign out");
  }
}

export function AccountSettings() {
  const { user, isLoading } = useAuthSession();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center px-4 py-12">
        <p className="text-muted-foreground text-sm">Loading account info…</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center gap-4 px-4 py-12">
        <UserIcon className="text-muted-foreground size-12" />
        <p className="text-muted-foreground text-sm">You are not signed in.</p>
        <Link
          className="text-primary text-sm hover:underline"
          to="/auth"
          search={{ mode: "signin" }}
        >
          Sign in to your Story Forge account
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 px-4 pb-10">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Profile</CardTitle>
          <CardDescription>Your Story Forge account information</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-1">
            <Label className="text-muted-foreground text-xs">Name</Label>
            <p className="text-sm font-medium">{user.name ?? "Not set"}</p>
          </div>
          <Separator />
          <div className="grid gap-1">
            <Label className="text-muted-foreground text-xs">Email</Label>
            <p className="text-sm font-medium">{user.email}</p>
          </div>
          <Separator />
          <div className="grid gap-1">
            <Label className="text-muted-foreground text-xs">User ID</Label>
            <p className="text-muted-foreground font-mono text-xs">{user.id}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-destructive text-lg">Danger zone</CardTitle>
          <CardDescription>Sign out of your account on this device</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={handleAccountSignOut} variant="destructive">
            <LogOutIcon className="mr-2 size-4" />
            Sign out
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
