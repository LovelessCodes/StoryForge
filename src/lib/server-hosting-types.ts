export type HostedServerInstance = {
  id: number;
  name: string;
  version: string;
  port: number;
  bind_ip: string;
  data_dir: string;
  start_params: string;
  favorite: boolean;
  last_played: number | null;
  total_time_played: number;
};

export type ServerRuntimeStatus = {
  status: "not_installed" | "stopped" | "starting" | "running" | "stopping" | "crashed";
  pid: number | null;
  uptime: number | null;
  exit_code: number | null;
};

export type WhitelistEntry = {
  uid: string;
  name: string;
  added_at?: number;
  added_by?: string;
};

export type ServerLogLine = {
  offset: number;
  timestamp: string;
  line: string;
};

export type ServerLogsResponse = {
  lines: ServerLogLine[];
  next_offset: number;
  has_more: boolean;
};

export type CreateInstanceParams = {
  name: string;
  version: string;
  data_dir: string;
  port: number;
  bind_ip: string;
  start_params: string;
  password: string;
  whitelistEnabled: boolean;
  defaultWhitelistUid: string;
  defaultWhitelistName: string;
};

export type UpdateInstancePartial = {
  name?: string;
  version?: string;
  port?: number;
  bind_ip?: string;
  data_dir?: string;
  start_params?: string;
  favorite?: boolean;
  last_played?: number;
  total_time_played?: number;
};
