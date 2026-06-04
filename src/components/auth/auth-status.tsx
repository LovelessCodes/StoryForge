import { Link } from "@tanstack/react-router";
import { DoorClosed, DoorOpen, Loader } from "lucide-react";
import { toast } from "sonner";

import { useAuthSession } from "@/hooks/use-auth-session";
import { authClient, clearAuthToken } from "@/lib/auth";

/**
 * Sidebar footer auth button — styled like the Settings / Discord buttons.
 *
 * Not signed in: green background, DoorOpen (door in), "Sign in" → links to /auth.
 * Signed in:     red  background, DoorClosed (door out), shows username,
 *                 hover reveals "Sign out", click signs out.
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
    const displayName = user.name ?? user.email ?? "User";

    return (
      <button
        className="group/button bg-sidebar relative w-full cursor-pointer overflow-hidden p-2 px-6 text-center font-semibold in-data-[state=collapsed]:px-2"
        onClick={handleSignOut}
        type="button"
      >
        {/* Rest state: icon + username */}
        <div className="flex items-center justify-center gap-2">
          <div className="bg-destructive absolute size-2 opacity-0 transition-all duration-300 group-hover/button:scale-[100.8] group-hover/button:opacity-100" />
          <DoorClosed className="inline-block size-4 transition-all duration-300 group-hover/button:translate-x-12 group-hover/button:opacity-0" />
          <span className="truncate in-data-[state=collapsed]:hidden">{displayName}</span>
        </div>

        {/* Hover state: "Sign out" slides in */}
        <div className="text-primary-foreground absolute top-0 z-10 flex h-full w-full translate-x-12 items-center justify-center gap-2 opacity-0 transition-all duration-300 group-hover/button:-translate-x-5 group-hover/button:opacity-100 in-data-[state=collapsed]:group-hover/button:-translate-x-2">
          <span className="in-data-[state=collapsed]:hidden">Sign out</span>
          <DoorClosed className="inline-block size-4" />
        </div>
      </button>
    );
  }

  // Not signed in: green, door open, link to /auth
  return (
    <Link to="/auth">
      <button
        className="group/button bg-sidebar relative w-full cursor-pointer overflow-hidden p-2 px-6 text-center font-semibold in-data-[state=collapsed]:px-2"
        type="button"
      >
        {/* Rest state: icon + "Sign in" */}
        <div className="flex items-center justify-center gap-2">
          <div className="absolute size-2 bg-green-500 opacity-0 transition-all duration-300 group-hover/button:scale-[100.8] group-hover/button:opacity-100" />
          <DoorOpen className="inline-block size-4 transition-all duration-300 group-hover/button:translate-x-12 group-hover/button:opacity-0" />
        </div>

        {/* Hover state: "Sign in" slides in */}
        <div className="text-primary-foreground absolute top-0 z-10 flex h-full w-full translate-x-12 items-center justify-center gap-2 opacity-0 transition-all duration-300 group-hover/button:-translate-x-5 group-hover/button:opacity-100 in-data-[state=collapsed]:group-hover/button:-translate-x-2">
          <span className="in-data-[state=collapsed]:hidden">Sign in</span>
          <DoorOpen className="inline-block size-4" />
        </div>
      </button>
    </Link>
  );
}
