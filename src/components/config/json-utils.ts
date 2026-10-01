import type { JSONObject, JSONValue } from "@/lib/types";

export function isObject(val: JSONValue): val is JSONObject {
  return typeof val === "object" && val !== null && !Array.isArray(val);
}

export function pathKey(path: (string | number)[]) {
  return path.join(".");
}

export function deepSet(current: JSONValue, path: (string | number)[], next: JSONValue): JSONValue {
  if (path.length === 0) return next;
  const [head, ...rest] = path;
  if (Array.isArray(current)) {
    const clone = [...current];
    const idx = head as number;
    clone[idx] = deepSet(clone[idx], rest, next);
    return clone;
  }
  if (isObject(current)) {
    return {
      ...current,
      [head]: deepSet(current[head as string], rest, next),
    };
  }
  return current;
}

export function getAtPath(current: JSONValue, path: (string | number)[]): JSONValue {
  return path.reduce<JSONValue>((acc, key) => {
    if (Array.isArray(acc)) return acc[key as number];
    if (isObject(acc)) return acc[key as string];
    return acc;
  }, current);
}

/** Heuristic + tolerant initial parse, ported from the legacy editor. */
export function safeInitialParse(raw: JSONValue, setErr: (s: string | null) => void): JSONValue {
  if (typeof raw !== "string") return raw as unknown as JSONValue;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return {};
  const looksJson =
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"));
  if (!looksJson) {
    // Sometimes the backend already parsed and then stringified with
    // Object.toString -> "[object Object]".
    if (trimmed === "[object Object]") {
      setErr(
        'Received a non-serialized object placeholder ("[object Object]"). Ensure the backend sends JSON text.',
      );
      return {};
    }
    // Try to recover common issues (single quotes, trailing commas).
    let attempt = trimmed.replace(/\r?\n/g, "\n").replace(/(['"])\s*,\s*([}\]])/g, "$1$2");
    // Replace single quotes with double quotes cautiously (only outside already double quoted).
    if (attempt.includes("':") || attempt.match(/:'[^']+'/)) {
      attempt = attempt.replace(/'([^']*)'/g, '"$1"');
    }
    try {
      return JSON.parse(attempt);
    } catch (e) {
      setErr(
        `Not recognized as JSON (startsWith token: ${trimmed.slice(0, 12)}). ${(e as Error).message}`,
      );
      return {};
    }
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    // Retry with minor sanitation (remove trailing commas).
    const attempt = trimmed.replace(/,\s*([}\]])/g, "$1");
    try {
      return JSON.parse(attempt);
    } catch (e2) {
      setErr((e2 as Error).message);
      return {};
    }
  }
}
