export const hostedServersQueryKey = () => ["hostedServers"] as const;

export const serverStatusQueryKey = (id: number) => ["serverStatus", id] as const;

export const serverConfigQueryKey = (id: number) => ["hostedServer", id, "config"] as const;

export const whitelistQueryKey = (id: number) => ["hostedServer", id, "whitelist"] as const;

export const playerLookupByUidQueryKey = (uid: string) => ["playerLookup", "uid", uid] as const;

export const playerLookupByNameQueryKey = (name: string) => ["playerLookup", "name", name] as const;
