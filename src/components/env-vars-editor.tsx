import { MinusIcon, PlusIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type EnvVarEntry = { key: string; value: string };

interface EnvVarsEditorProps {
  entries: EnvVarEntry[];
  onChange: (entries: EnvVarEntry[]) => void;
}

export function EnvVarsEditor({ entries, onChange }: EnvVarsEditorProps) {
  const setEntry = (index: number, field: "key" | "value", text: string) => {
    const next = entries.map((e, i) => (i === index ? { ...e, [field]: text } : e));
    onChange(next);
  };

  const add = () => onChange([...entries, { key: "", value: "" }]);

  const remove = (index: number) => onChange(entries.filter((_, i) => i !== index));

  return (
    <div className="flex flex-col gap-2">
      {entries.map(({ key, value }, i) => (
        <div className="flex items-center gap-2" key={i}>
          <Input
            className="flex-1"
            onChange={(e) => setEntry(i, "key", e.target.value)}
            placeholder="Key"
            value={key}
          />
          <span className="text-muted-foreground text-xs">=</span>
          <Input
            className="flex-1"
            onChange={(e) => setEntry(i, "value", e.target.value)}
            placeholder="Value"
            value={value}
          />
          <Button
            aria-label="Remove"
            className="shrink-0"
            onClick={() => remove(i)}
            size="icon-sm"
            variant="ghost"
          >
            <MinusIcon className="opacity-60" size={14} />
          </Button>
        </div>
      ))}
      <Button className="self-start" onClick={add} size="sm" variant="outline">
        <PlusIcon className="mr-1" size={14} />
        Add
      </Button>
    </div>
  );
}
