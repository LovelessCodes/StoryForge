import { t } from "@/lib/i18n";

/**
 * Shared status presentation for hosted server instances.
 *
 * The labels are getters so each access resolves through the live translator
 * and reflects the current language; unknown statuses still fall back to the
 * raw status string at the call site.
 */
export const statusLabels: Record<string, string> = {
  get crashed() {
    return t("hosting.status.crashed");
  },
  get not_installed() {
    return t("hosting.status.notInstalled");
  },
  get running() {
    return t("hosting.status.running");
  },
  get starting() {
    return t("hosting.status.starting");
  },
  get stopped() {
    return t("hosting.status.stopped");
  },
  get stopping() {
    return t("hosting.status.stopping");
  },
};

export const statusDot: Record<string, string> = {
  crashed: "bg-destructive",
  not_installed: "bg-muted-foreground/40",
  running: "bg-success",
  starting: "bg-warning",
  stopped: "bg-muted-foreground/40",
  stopping: "bg-warning",
};

export const statusText: Record<string, string> = {
  crashed: "text-destructive",
  not_installed: "text-muted-foreground",
  running: "text-success",
  starting: "text-warning",
  stopped: "text-muted-foreground",
  stopping: "text-warning",
};

export function formatUptime(uptime: number) {
  return `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m`;
}
