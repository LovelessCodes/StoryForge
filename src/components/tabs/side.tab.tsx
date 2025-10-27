import { useModsFilters } from "@/stores/modsFilters";
import { Tabs, TabsList, TabsTab } from "../ui/tabs";

export default function SideToggleGroup() {
	const { side, setSide } = useModsFilters();

	return (
		<Tabs onValueChange={setSide} value={side}>
			<TabsList>
				<TabsTab aria-label="Any" value="any">
					Any
				</TabsTab>
				<TabsTab aria-label="Client" value="client">
					Client
				</TabsTab>
				<TabsTab aria-label="Server" value="server">
					Server
				</TabsTab>
				<TabsTab aria-label="Both" value="both">
					Both
				</TabsTab>
				<TabsTab aria-label="Installed" value="installed">
					Installed
				</TabsTab>
				<span className="top-0 px-2 start-1 text-xs z-10 block -translate-y-1/2 rounded-md absolute inline-flex text-muted-foreground pointer-events-none bg-background">
					Side
				</span>
			</TabsList>
		</Tabs>
	);
}
