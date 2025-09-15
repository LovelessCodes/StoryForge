import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { ChevronDownIcon } from "lucide-react";
import { useRef } from "react";
import { SearchInput } from "@/components/inputs";
import { PublicServerList } from "@/components/lists/public.servers.list";
import { TextSwitch } from "@/components/switches/text.switch";
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
} from "@/components/ui/select";
import { publicServersQuery } from "@/hooks/use-public-servers";
import { gameVersionsQuery } from "@/lib/queries";
import { compareSemverDesc } from "@/lib/utils";
import {
	type ServersFilters,
	useServersFilters,
} from "@/stores/serversFilters";

export const Route = createFileRoute("/public-servers")({
	component: RouteComponent,
	loader: ({ context: { queryClient } }) => {
		queryClient.ensureQueryData(gameVersionsQuery);
		queryClient.ensureQueryData(publicServersQuery());
	},
});

const sortOptions: Record<ServersFilters["sortBy"], string> = {
	maxplayers: "Max Players",
	mods: "Mods",
	name: "Name",
	players: "Players",
	version: "Version",
	whitelist: "Whitelist",
};

function RouteComponent() {
	const parentRef = useRef<HTMLDivElement | null>(null);
	const { data: gameVersions } = useSuspenseQuery(gameVersionsQuery);
	const { data: publicServers } = useSuspenseQuery(publicServersQuery());
	const {
		searchText,
		setSearchText,
		selectedGameVersions,
		addGameVersion,
		removeGameVersion,
		sortBy,
		setSortBy,
		orderDirection,
		setOrderDirection,
	} = useServersFilters();
	return (
		<div
			className="grid grid-rows-[min-content_1fr] gap-2 w-full"
			style={{ height: "100vh" }}
		>
			<div className="flex gap-2 flex-wrap items-center h-fit sticky top-0 bg-background/10 backdrop-blur-md z-10 px-4 py-2">
				<SearchInput
					onChange={(e) => setSearchText(e.target.value)}
					placeholder="Search servers..."
					value={searchText}
				/>
				<DropdownMenu>
					<DropdownMenuTrigger className="flex gap-1 w-46 truncate">
						{selectedGameVersions.length > 0
							? selectedGameVersions.length > 1
								? `${selectedGameVersions.length} versions`
								: selectedGameVersions[0]
							: "Game version(s)"}
						<ChevronDownIcon className="size-4 opacity-50" />
					</DropdownMenuTrigger>
					<DropdownMenuContent align="start">
						{gameVersions?.sort(compareSemverDesc).map((version) => (
							<DropdownMenuCheckboxItem
								checked={!!selectedGameVersions?.find((v) => v === version)}
								key={version}
								onCheckedChange={(checked) => {
									if (checked) {
										addGameVersion(version);
									} else {
										removeGameVersion(version);
									}
								}}
								onSelect={(e) => e.preventDefault()}
							>
								{version}
							</DropdownMenuCheckboxItem>
						))}
					</DropdownMenuContent>
				</DropdownMenu>
				<Select
					onValueChange={(value) =>
						setSortBy(value as ServersFilters["sortBy"])
					}
					value={sortBy}
				>
					<SelectTrigger>
						{sortBy
							? `${sortOptions[sortBy as keyof typeof sortOptions]}`
							: "Sort by"}
					</SelectTrigger>
					<SelectContent align="start">
						{Object.entries(sortOptions).map(([key, value]) => (
							<SelectItem key={key} value={key}>
								{value}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				<TextSwitch
					checked={orderDirection === "descending"}
					onCheckedChange={(checked) =>
						setOrderDirection(checked ? "descending" : "ascending")
					}
					textChecked="Asc"
					textUnchecked="Desc"
				/>
			</div>
			<div
				className="h-full py-2 relative overflow-auto w-full"
				ref={parentRef}
			>
				{publicServers && (
					<PublicServerList
						parentRef={parentRef}
						publicServers={publicServers?.data}
					/>
				)}
			</div>
		</div>
	);
}
