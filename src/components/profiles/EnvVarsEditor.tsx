import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type EnvVarEntry = { id: string; key: string; value: string };

export function EnvVarsEditor({
  entries,
  onChange,
}: {
  entries: EnvVarEntry[];
  onChange: (entries: EnvVarEntry[]) => void;
}) {
  return (
    <div className="grid gap-2">
      {entries.length === 0 && (
        <p className="text-muted-foreground text-[11px]">
          No environment variables. These are passed to the game process on launch.
        </p>
      )}
      {entries.map((entry, index) => (
        <div key={entry.id} className="flex items-center gap-2">
          <Input
            aria-label="Variable name"
            className="font-mono"
            placeholder="KEY"
            value={entry.key}
            onChange={(event) => {
              const next = [...entries];
              next[index] = { ...entry, key: event.target.value };
              onChange(next);
            }}
          />
          <Input
            aria-label="Variable value"
            className="font-mono"
            placeholder="value"
            value={entry.value}
            onChange={(event) => {
              const next = [...entries];
              next[index] = { ...entry, value: event.target.value };
              onChange(next);
            }}
          />
          <Button
            aria-label="Remove variable"
            size="icon-sm"
            variant="ghost"
            onClick={() => onChange(entries.filter((item) => item.id !== entry.id))}
          >
            <Trash2 />
          </Button>
        </div>
      ))}
      <Button
        className="w-fit"
        size="sm"
        variant="outline"
        onClick={() => onChange([...entries, { id: crypto.randomUUID(), key: "", value: "" }])}
      >
        <Plus /> Add variable
      </Button>
    </div>
  );
}

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
