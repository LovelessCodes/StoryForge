import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useEffect, useRef } from "react";

/**
 * Subscribes to a Tauri event while the component is mounted, or while
 * `enabled` is true.
 *
 * `listen` resolves asynchronously: a subscription that settles after unmount
 * (or after `enabled` flipped off) is disposed here, because the cleanup has
 * already run and would otherwise leak the listener for the app's lifetime.
 * The handler is read through a ref, so an inline arrow does not resubscribe.
 */
export function useTauriEvent<T>(event: string, onEvent: (payload: T) => void, enabled = true) {
  const handlerRef = useRef(onEvent);
  useEffect(() => {
    handlerRef.current = onEvent;
  });

  useEffect(() => {
    if (!enabled) return undefined;

    let unlisten: UnlistenFn | undefined;
    let cancelled = false;
    void listen<T>(event, (payload) => handlerRef.current(payload.payload)).then((dispose) => {
      if (cancelled) {
        dispose();
        return;
      }
      unlisten = dispose;
    });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [event, enabled]);
}
