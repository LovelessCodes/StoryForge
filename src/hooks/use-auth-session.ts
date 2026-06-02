import { authClient } from "@/lib/auth";

/**
 * Wraps Better Auth's useSession hook for convenient access
 * throughout the app. Returns session, user, loading state, and
 * sign-out action.
 */
export function useAuthSession() {
  const { data, isPending, error, refetch } = authClient.useSession();

  return {
    session: data?.session ?? null,
    user: data?.user ?? null,
    isLoading: isPending,
    error,
    refetch,
  };
}
