import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";

import type { Server } from "@/stores/servers";

export const serverStatusQueryKey = (server: Pick<Server, "id">) =>
  ["serverStatus", server.id] as const;

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
        timeout_secs: 3,
      }),
    queryKey: serverStatusQueryKey(server),
    retry: false,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  return {
    isChecking: isPending,
    isOnline: !isPending && !isError,
  };
};
