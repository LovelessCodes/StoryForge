import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { type ModsFilters, useModsFilters } from "@/stores/modsFilters";

export default function SideToggleGroup() {
	const { side, setSide } = useModsFilters();

	return (
		<ToggleGroup
			className="inline-flex items-center whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive h-9 has-[>svg]:px-3 border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50 w-[300px] justify-between relative"
			onValueChange={(value: ModsFilters["side"]) => {
				if (value) setSide(value);
			}}
			type="single"
			value={side}
		>
			<ToggleGroupItem aria-label="Both" value="both">
				Both
			</ToggleGroupItem>
			<ToggleGroupItem aria-label="Client" value="client">
				Client
			</ToggleGroupItem>
			<ToggleGroupItem aria-label="Server" value="server">
				Server
			</ToggleGroupItem>
			<ToggleGroupItem aria-label="Installed" value="installed">
				Installed
			</ToggleGroupItem>
		</ToggleGroup>
	);
}
