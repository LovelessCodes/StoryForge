import { Link } from "@tanstack/react-router";
import { DoorClosed, DoorOpen, Loader } from "lucide-react";
import { toast } from "sonner";

import { SidebarFooterButton } from "@/components/buttons/sidebar-footer.button";
import { useAuthSession } from "@/hooks/use-auth-session";
import { authClient, clearAuthToken } from "@/lib/auth";

/**
 * Sidebar footer auth button — styled like the Settings / Discord buttons.
 *
 * Not signed in: green dot, DoorOpen (door in), "Sign in" → links to /auth.
 * Signed in:     destructive dot, DoorClosed (door out), shows username,
 *                hover reveals "Sign out", click signs out.
 */
async function handleSignOut() {
  try {
    await authClient.signOut();
    clearAuthToken();
    toast.success("Signed out");
  } catch {
    toast.error("Failed to sign out");
  }
}

export function AuthStatus() {
  const { user, isLoading } = useAuthSession();

  if (isLoading) {
    return (
      <div className="bg-sidebar w-full px-6 py-2 text-center">
        <Loader className="text-muted-foreground inline-block size-4 animate-spin" />
        <span className="text-muted-foreground animate-pulse text-xs in-data-[state=collapsed]:hidden">
          Loading…
        </span>
      </div>
    );
  }

  if (user) {
    return (
      <SidebarFooterButton
        dotClassName="bg-destructive"
        icon={DoorClosed}
        label="Sign out"
        onClick={handleSignOut}
        restLabel={user.name ?? user.email ?? "User"}
      />
    );
  }

  // Not signed in: link to /auth
  return (
    <Link to="/auth">
      <SidebarFooterButton dotClassName="bg-green-500" icon={DoorOpen} label="Sign in" />
    </Link>
  );
}
