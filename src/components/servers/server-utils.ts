import type { Server } from "@/stores/servers";

/** `ip:port` when a port is set, otherwise just the host. */
export function serverAddress(server: Pick<Server, "ip" | "port">) {
  return server.port ? `${server.ip}:${server.port}` : server.ip;
}

/** `Name,ip:port,password` — the format stored in clientsettings.json. */
export function serverEntryString(server: Pick<Server, "name" | "ip" | "port" | "password">) {
  return `${server.name},${server.ip}${server.port ? `:${server.port}` : ""},${
    server.password ? server.password : ""
  }`;
}

export type SniffResult = {
  server_game_version: string | null;
  server_network_version: string | null;
  password_protected: boolean;
  password_valid: boolean | null;
  whitelisted: boolean;
  banned: boolean;
  server_full: boolean;
  auth_required: boolean;
  login_token: string | null;
  disconnect_message: string | null;
};

/** True when both versions share major and minor parts ("1.21.3" vs "1.21.0"). */
export function sameMinorVersion(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false;
  const [aMajor, aMinor] = a.split(".");
  const [bMajor, bMinor] = b.split(".");
  return aMajor === bMajor && aMinor === bMinor;
}
