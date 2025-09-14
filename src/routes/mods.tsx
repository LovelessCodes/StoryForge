import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { invoke } from "@tauri-apps/api/core";
import { ChevronDownIcon } from "lucide-react";
import { useRef } from "react";
import { AuthorCombobox } from "@/components/comboboxes/author.combobox";
import { SearchInput } from "@/components/inputs";
import { ModList } from "@/components/lists/mod.list";
import { TextSwitch } from "@/components/switches/text.switch";
import SideToggleGroup from "@/components/toggle-groups/side.toggle-group";
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
import { compareSemverDesc } from "@/lib/utils";
import { type ModsFilters, useModsFilters } from "@/stores/modsFilters";

export type ModTag = {
	tagid: number;
	name: string;
	color: string;
};

export const gameVersionsQuery = {
	queryFn: () => invoke("fetch_versions") as Promise<string[]>,
	queryKey: ["gameVersions"],
};

const modTagsQuery = {
	queryFn: () => invoke("fetch_mod_tags") as Promise<ModTag[]>,
	queryKey: ["modTags"],
};

export const Route = createFileRoute("/mods")({
	component: RouteComponent,
	loader: ({ context: { queryClient } }) => {
		queryClient.ensureQueryData(gameVersionsQuery);
		queryClient.ensureQueryData(modTagsQuery);
	},
});

const sortOptions: Record<ModsFilters["sortBy"], string> = {
	comments: "Comments",
	created: "Created",
	downloads: "Downloads",
	follows: "Follows",
	name: "Name",
	trending: "Trending",
	updated: "Last Updated",
};

const categoryOptions: Record<ModsFilters["category"], string> = {
	externaltool: "External Tool",
	mod: "Mod",
	other: "Other",
};

function RouteComponent() {
	const { data: gameVersions } = useSuspenseQuery(gameVersionsQuery);
	const { data: modTags } = useSuspenseQuery(modTagsQuery);

	const {
		selectedGameVersions,
		selectedModTags,
		removeGameVersion,
		addGameVersion,
		removeModTag,
		addModTag,
		searchText,
		setSearchText,
		sortBy,
		setSortBy,
		orderDirection,
		setOrderDirection,
		author,
		setAuthor,
		category,
		setCategory,
	} = useModsFilters();

	const parentRef = useRef<HTMLDivElement>(null);

	return (
		<div
			className="flex flex-col gap-2 w-full"
			style={{
				height: "100vh",
			}}
		>
			<div className="flex gap-2 flex-wrap items-center h-fit sticky top-0 bg-background/10 backdrop-blur-md z-10 px-4 py-2">
				<SearchInput
					onChange={(e) => setSearchText(e.target.value)}
					placeholder="Search mods..."
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
				<DropdownMenu>
					<DropdownMenuTrigger className="w-46 flex gap-1 truncate">
						{selectedModTags.length > 0
							? selectedModTags.length > 1
								? `${selectedModTags.length} tags`
								: selectedModTags[0].name
							: "Mod tag(s)"}
						<ChevronDownIcon className="size-4 opacity-50" />
					</DropdownMenuTrigger>
					<DropdownMenuContent align="start">
						{modTags
							?.sort((a, b) => a.name.localeCompare(b.name))
							.map((tag) => (
								<DropdownMenuCheckboxItem
									checked={
										!!selectedModTags?.find((t) => t.tagid === tag.tagid)
									}
									key={tag.tagid}
									onCheckedChange={(checked) => {
										if (checked) {
											addModTag(tag);
										} else {
											removeModTag(tag);
										}
									}}
									onSelect={(e) => e.preventDefault()}
								>
									{tag.name}
								</DropdownMenuCheckboxItem>
							))}
					</DropdownMenuContent>
				</DropdownMenu>
				<Select
					onValueChange={(value) => setSortBy(value as ModsFilters["sortBy"])}
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
				<Select
					onValueChange={(value) =>
						setCategory(value as ModsFilters["category"])
					}
					value={category}
				>
					<SelectTrigger>
						{category
							? `${categoryOptions[category as keyof typeof categoryOptions]}`
							: "Category"}
					</SelectTrigger>
					<SelectContent align="start">
						{Object.entries(categoryOptions).map(([key, value]) => (
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
				<AuthorCombobox
					onChange={(e) => setAuthor(e.target.value)}
					value={author}
				/>
				<SideToggleGroup />
			</div>
			<div
				className="h-full px-4 py-2 relative overflow-auto w-full"
				ref={parentRef}
			>
				<ModList installation={null} parentRef={parentRef} />
			</div>
		</div>
	);
}
