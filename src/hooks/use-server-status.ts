import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";

import type { Server } from "@/stores/servers";

/**
 * Keyed by the connection inputs, not just the address hash: a password-only
 * edit must not reuse the cached probe result.
 */
export const serverSniffQueryKey = (server: Pick<Server, "id" | "ip" | "password" | "port">) =>
  ["serverSniff", server.id, server.ip, server.port, server.password] as const;

/**
 * Pings a saved server using the same handshake probe as the "Test Server"
 * button, but with a short timeout tuned for a background reachability
 * check rather than a full version/password sniff.
 */
export const useServerStatus = (server: Server) => {
  const { isPending, isError } = useQuery({
    queryFn: () =>
      invoke("sniff_server", {
        host: server.ip,
        password: server.password || undefined,
        port: server.port ?? undefined,
        // Tauri camelCases direct command arguments (`timeout_secs` in Rust).
        timeoutSecs: 3,
      }),
    queryKey: serverSniffQueryKey(server),
    retry: false,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  return {
    isChecking: isPending,
    isOnline: !isPending && !isError,
  };
};
