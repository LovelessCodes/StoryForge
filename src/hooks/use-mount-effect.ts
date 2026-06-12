import { useEffect } from "react";

/**
 * Escape hatch for one-time external sync on mount.
 * Wraps useEffect with an empty dependency array to make intent explicit.
 *
 * Use only for: DOM integration (focus, scroll), third-party widget lifecycles,
 * browser API subscriptions, or stable dependencies (singletons, refs, context
 * values that never change).
 */
export function useMountEffect(effect: () => void | (() => void)) {
  useEffect(effect, []); // oxlint-disable-line exhaustive-deps
}
