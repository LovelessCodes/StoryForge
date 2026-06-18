import { useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useRef } from "react";

import { useHostedServers } from "@/hooks/queries/server-hosting/use-queries";
import type { ServerRuntimeStatus } from "@/lib/server-hosting-types";

import { serverStatusQueryKey } from "./query-keys";

export function useServerStatusListener() {
  const queryClient = useQueryClient();
  const { data: instances } = useHostedServers();
  const listenedIds = useRef(new Set<number>());
  const unlistenFns = useRef(new Map<number, () => void>());

  useEffect(() => {
    if (!instances) return;

    let cancelled = false;
    const listened = listenedIds.current;
    const unlisteners = unlistenFns.current;
    const currentIds = new Set(instances.map((i) => i.id));

    // Fetch initial statuses for all instances (Tauri events only fire on changes)
    for (const inst of instances) {
      void invoke<{ status: string; pid?: number; uptime?: number; exit_code?: number }>(
        "get_server_status",
        { instanceId: inst.id },
      )
        .then((status) => {
          if (cancelled) return;
          queryClient.setQueryData<ServerRuntimeStatus>(serverStatusQueryKey(inst.id), {
            status: status.status as ServerRuntimeStatus["status"],
            pid: status.pid ?? null,
            uptime: status.uptime ?? null,
            exit_code: status.exit_code ?? null,
          });
        })
        .catch(() => {
          // server not installed — leave as initial data
        });
    }

    // Remove listeners for instances no longer in the list
    for (const [id, unlisten] of unlisteners.entries()) {
      if (!currentIds.has(id)) {
        unlisten();
        unlisteners.delete(id);
        listened.delete(id);
      }
    }

    // Add listeners for new instances
    for (const inst of instances) {
      if (listened.has(inst.id)) continue;
      listened.add(inst.id);

      const eventName = `server-status:${inst.id}`;
      void (async () => {
        try {
          const unlisten = await listen<{
            status: string;
            pid?: number;
            uptime?: number;
            exit_code?: number;
          }>(eventName, (event) => {
            if (cancelled) return;
            queryClient.setQueryData<ServerRuntimeStatus>(serverStatusQueryKey(inst.id), {
              status: event.payload.status as ServerRuntimeStatus["status"],
              pid: event.payload.pid ?? null,
              uptime: event.payload.uptime ?? null,
              exit_code: event.payload.exit_code ?? null,
            });
          });
          if (!cancelled) {
            unlisteners.set(inst.id, unlisten);
          } else {
            unlisten();
          }
        } catch {
          // ignore listener setup errors
        }
      })();
    }

    return () => {
      cancelled = true;
      for (const unlisten of unlisteners.values()) {
        unlisten();
      }
      unlisteners.clear();
      listened.clear();
    };
  }, [instances, queryClient]);
}
