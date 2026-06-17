import { type UseQueryOptions, keepPreviousData, useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";

export type PublicServer = {
  serverName: string;
  serverIP: string;
  playstyle: {
    id: string;
    langCode: string;
  };
  mods: {
    id: string;
    version: string;
  }[];
  maxPlayers: string;
  players: number;
  gameVersion: string;
  hasPassword: boolean;
  whitelisted: boolean;
  gameDescription: string;
};

type PublicServersResponse = {
  statuscode: string;
  data: PublicServer[];
};

export const usePublicServers = (
  props?: Omit<
    UseQueryOptions<PublicServersResponse, Error, PublicServersResponse>,
    "queryKey" | "queryFn"
  >,
) =>
  useQuery({
    queryFn: () => invoke("fetch_public_servers") as Promise<PublicServersResponse>,
    queryKey: ["publicServers"],
    staleTime: Infinity,
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: false,
    ...props,
  });
