import { invoke } from "@tauri-apps/api/core";

/**
 * Write a message to the application log file (visible in Settings → Application Log).
 */
export async function logToFile(level: "INFO " | "DEBUG" | "ERROR", message: string) {
  try {
    await invoke("log_message", { level, message });
  } catch {
    // Silently ignore — don't break the app if logging fails
    console.error(`[logToFile] Failed to write log: ${message}`);
  }
}
