/**
 * Helpers for reading errors from Tauri commands.
 *
 * `invoke` rejects with the serialized error value — our commands return
 * `{ name, message }` objects (and the login pre-challenge additionally
 * carries `prelogintoken`). An `instanceof Error` check misses those, and the
 * `String(error)` fallback would render "[object Object]".
 */

export interface ErrorInfo {
  /** Best-effort human-readable message. */
  message: string;
  /** Stable error code from the backend (`UiError.name`), when present. */
  name?: string;
  /** Present on the login pre-challenge (a TOTP code is required). */
  prelogintoken?: string;
}

function readField(error: unknown, field: string): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const value = (error as Record<string, unknown>)[field];
  return typeof value === "string" ? value : undefined;
}

/** Best-effort message from any thrown value, never "[object Object]". */
export function errorMessage(error: unknown): string {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  const message = readField(error, "message");
  if (message !== undefined) return message;
  if (typeof error === "object" && error !== null) {
    try {
      return JSON.stringify(error);
    } catch {
      // Circular or otherwise unstringifiable: fall through.
    }
  }
  return String(error);
}

/** Full payload for flows that need more than the message (login challenge). */
export function errorInfo(error: unknown): ErrorInfo {
  return {
    message: errorMessage(error),
    name: readField(error, "name"),
    prelogintoken: readField(error, "prelogintoken"),
  };
}
