import { useEffect, useState } from "react";

/**
 * Returns `value` once it has stopped changing for `delayMs`. Keeps the input
 * itself immediate while the work downstream of it (a full catalog request per
 * search) waits for typing to settle.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
