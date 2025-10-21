import { createFileRoute } from "@tanstack/react-router";
import { ChevronDownIcon } from "lucide-react";
import { useState } from "react";
import { SearchInput } from "@/components/inputs";
import { WorldList } from "@/components/lists/world.list";
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ErrorComponent } from "@/components/ui/error";
import { useSaves } from "@/hooks/use-saves";
import { useInstallations } from "@/stores/installations";

export const Route = createFileRoute("/worlds")({
	component: RouteComponent,
	errorComponent: ErrorComponent,
});

function RouteComponent() {
	// States
	const [searchText, setSearchText] = useState("");
	const [selectedInstallationId, setSelectedInstallationId] = useState<
		number | null
	>(null);

	// Stores
	const { installations } = useInstallations();

	// Queries
	const { data: worlds } = useSaves();
	const filteredWorlds = worlds?.filter((world) => {
		const matchesSearchText = world.data.world_name
			.toLowerCase()
			.includes(searchText.toLowerCase());
		const matchesInstallation = selectedInstallationId
			? installations.find(
					(installation) =>
						installation.path.split("/").pop() === world.installation_name,
				)?.id === selectedInstallationId
			: true;
		return matchesSearchText && matchesInstallation;
	});

	return (
		<div
			className="grid grid-rows-[min-content_1fr] gap-2 w-full"
			style={{ height: "100vh" }}
		>
			<div className="flex gap-2 flex-wrap items-center h-fit sticky top-0 bg-background/10 backdrop-blur-md z-10 px-4 py-2">
				<SearchInput
					onChange={(e) => setSearchText(e.target.value)}
					placeholder="Search worlds..."
					value={searchText}
				/>
				<DropdownMenu>
					<DropdownMenuTrigger>
						{selectedInstallationId
							? `${installations.find((installation) => installation.id === selectedInstallationId)?.name}`
							: "Select installation"}
						<ChevronDownIcon className="size-4 opacity-50" />
					</DropdownMenuTrigger>
					<DropdownMenuContent align="start">
						{installations.map((installation) => (
							<DropdownMenuCheckboxItem
								checked={selectedInstallationId === installation.id}
								key={installation.id}
								onCheckedChange={() =>
									setSelectedInstallationId((prev) =>
										prev === installation.id ? null : installation.id,
									)
								}
							>
								{installation.name}
							</DropdownMenuCheckboxItem>
						))}
					</DropdownMenuContent>
				</DropdownMenu>
			</div>
			{filteredWorlds && (
				<div className="h-full px-4 relative overflow-auto w-full">
					<WorldList worlds={filteredWorlds} />
				</div>
			)}
		</div>
	);
}
