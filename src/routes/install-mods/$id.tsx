import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
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
import { ErrorComponent } from "@/components/ui/error";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
} from "@/components/ui/select";
import { useInstalledMods } from "@/hooks/use-installed-mods";
import { gameVersionsQuery, modTagsQuery } from "@/lib/queries";
import { cn, compareSemverDesc } from "@/lib/utils";
import { useInstallations } from "@/stores/installations";
import { type ModsFilters, useModsFilters } from "@/stores/modsFilters";

export const Route = createFileRoute("/install-mods/$id")({
	component: RouteComponent,
	errorComponent: ErrorComponent,
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

export type OutputMod = {
	modid: number;
	name: string;
	authors: string[];
	version: string;
	path: string;
};

function RouteComponent() {
	const { id } = Route.useParams();
	const { installations } = useInstallations();
	const installation = installations.find((inst) => inst.id === Number(id));
	const { data: gameVersions } = useQuery(gameVersionsQuery);
	const { data: modTags } = useQuery(modTagsQuery);
	const { data: installedMods } = useInstalledMods(installation?.path ?? "", {
		enabled: !!installation,
	});

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

	if (!installation || !installedMods) {
		return <div>Installation not found</div>;
	}

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
					<DropdownMenuTrigger
						className={cn(
							"flex gap-1 w-46 relative",
							selectedGameVersions.length > 0
								? "text-foreground"
								: "text-transparent",
						)}
					>
						<span
							className={cn(
								"pointer-events-none absolute start-1 z-10 block -translate-y-1/2 inline-flex text-muted-foreground px-2 transition-all",
								selectedGameVersions.length > 0
									? "top-0 bg-background text-xs"
									: "top-1/2 bg-transparent",
							)}
						>
							Game Version(s)
						</span>
						{selectedGameVersions.length > 0
							? selectedGameVersions.length > 1
								? `${selectedGameVersions.length} versions`
								: selectedGameVersions[0]
							: "-"}
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
					<DropdownMenuTrigger
						className={cn(
							"w-46 flex gap-1 relative",
							selectedModTags.length > 0
								? "text-foreground"
								: "text-transparent",
						)}
					>
						<span
							className={cn(
								"pointer-events-none absolute start-1 z-10 block -translate-y-1/2 inline-flex text-muted-foreground px-2 transition-all",
								selectedModTags.length > 0
									? "top-0 bg-background text-xs"
									: "top-1/2 bg-transparent",
							)}
						>
							Mod Tag(s)
						</span>
						{selectedModTags.length > 0
							? selectedModTags.length > 1
								? `${selectedModTags.length} tags`
								: selectedModTags[0].name
							: "-"}
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
				<div className="group relative">
					<Label className="bg-background text-muted-foreground pointer-events-none absolute start-1 top-0 z-10 block -translate-y-1/2 px-2 text-xs font-medium group-has-disabled:opacity-50">
						Sort by
					</Label>
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
				</div>
				<div className="group relative">
					<Label className="bg-background text-muted-foreground pointer-events-none absolute start-1 top-0 z-10 block -translate-y-1/2 px-2 text-xs font-medium group-has-disabled:opacity-50">
						Category
					</Label>
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
				</div>
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
			<div className="h-full px-4 w-full overflow-hidden">
				<div
					className="w-full bg-card p-2 rounded shadow border relative h-full overflow-auto"
					ref={parentRef}
				>
					<ModList installation={installation} parentRef={parentRef} />
				</div>
			</div>
		</div>
	);
}
