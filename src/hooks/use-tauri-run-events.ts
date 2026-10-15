import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useCallback, useEffect, useRef } from "react";

/**
 * Holds the Tauri listeners one run starts and stops.
 *
 * A run subscribes when it begins and calls `release()` when it ends — in its
 * `finally`, or before the next run so repeated runs do not stack duplicate
 * toasts. `subscribe` returns a handle that stops that one listener, for a run
 * whose listeners finish at different times. The hook also releases on unmount,
 * so leaving the screen cannot keep a listener alive.
 *
 * `subscribe` awaits `listen`, and a `release()` that lands while a subscription
 * is still settling disposes it on arrival: the cleanup has already run by then
 * and cannot see it.
 */
export function useTauriRunEvents() {
  const unlistens = useRef<UnlistenFn[]>([]);
  const generation = useRef(0);
  const eventRef = useRef<string | null>(null);

  const release = useCallback(() => {
    generation.current += 1;
    for (const unlisten of unlistens.current) unlisten();
    unlistens.current = [];
    eventRef.current = null;
  }, []);

  useEffect(
    () => () => {
      release();
    },
    [release],
  );

  const subscribe = useCallback(async <T>(event: string, onEvent: (payload: T) => void) => {
    const startedAt = generation.current;
    const unlisten = await listen<T>(event, (payload) => onEvent(payload.payload));
    if (startedAt !== generation.current) {
      unlisten();
      return () => {};
    }
    eventRef.current = event;
    unlistens.current.push(unlisten);
    return () => {
      unlisten();
      unlistens.current = unlistens.current.filter((fn) => fn !== unlisten);
    };
  }, []);

  return { subscribe, release, eventRef };
}
