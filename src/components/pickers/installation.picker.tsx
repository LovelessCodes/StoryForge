import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import type { Installation } from "@/stores/installations";

/** Installation picker shared by the server and edit-world dialogs. */
export function InstallationSelect({
  installations,
  onChange,
  value,
}: {
  installations: Installation[];
  onChange: (id: string) => void;
  value: string;
}) {
  const selected = installations.find((inst) => inst.id.toString() === value);

  return (
    <Select onValueChange={(v) => v && onChange(v)} value={value}>
      <SelectTrigger className="flex w-full gap-1 truncate">
        {selected ? `${selected.name} (${selected.version})` : "Game installation"}
      </SelectTrigger>
      <SelectContent align="start" alignItemWithTrigger={false}>
        {installations
          ?.toSorted((a, b) => a.index - b.index)
          .map((inst) => (
            <SelectItem key={inst.id} value={inst.id.toString()}>
              {inst.name} ({inst.version})
            </SelectItem>
          ))}
      </SelectContent>
    </Select>
  );
}
