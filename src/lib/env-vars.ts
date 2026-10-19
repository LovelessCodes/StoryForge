/** Editor entry for one environment variable; the id keys the reorderable row. */
export type EnvVarEntry = { id: string; key: string; value: string };

/** Converts editor entries to the `envVars` map sent to the backend. */
export function envEntriesToMap(entries: EnvVarEntry[]): Record<string, string> {
  return Object.fromEntries(
    entries.filter((entry) => entry.key.trim()).map((entry) => [entry.key.trim(), entry.value]),
  );
}

/** Converts a backend `envVars` map to editor entries. */
export function mapToEnvEntries(map: Record<string, string> | undefined): EnvVarEntry[] {
  return Object.entries(map ?? {}).map(([key, value]) => ({
    id: crypto.randomUUID(),
    key,
    value,
  }));
}
