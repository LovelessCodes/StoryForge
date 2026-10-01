/** Shared status presentation for hosted server instances. */
export const statusLabels: Record<string, string> = {
  crashed: "Crashed",
  not_installed: "Not installed",
  running: "Running",
  starting: "Starting",
  stopped: "Stopped",
  stopping: "Stopping",
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
