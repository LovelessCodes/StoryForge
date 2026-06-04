import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useRef } from "react";

import { AuthorAutocomplete } from "@/components/auto-completes/author.auto-complete";
import { UpdateAllButton } from "@/components/buttons/update-all.button";
import { SearchInput } from "@/components/inputs/search.input";
import { ModList } from "@/components/lists/mod.list";
import { TextSwitch } from "@/components/switches/text.switch";
import SideToggleGroup from "@/components/tabs/side.tab";
import { ErrorComponent } from "@/components/ui/error";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useInstalledMods } from "@/hooks/use-installed-mods";
import { useModUpdates } from "@/hooks/use-mod-updates";
import { gameVersionsQuery, modTagsQuery } from "@/lib/queries";
import { cn, compareSemverDesc, stripped } from "@/lib/utils";
import { useInstallationsStore } from "@/stores/installations";
import { type ModsFilters, useModsFilters } from "@/stores/modsFilters";

export const Route = createFileRoute("/install-mods/$id")({
  component: RouteComponent,
  errorComponent: ErrorComponent,
  loader: async ({ params }) => {
    // Find the installation by ID in the store
    const installation = useInstallationsStore
      .getState()
      .installations.find((inst) => inst.id === Number(params.id));
    if (!installation) {
      throw new Error("Installation not found");
    }
    return { installation };
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

export type OutputMod = {
  modid: number;
  name: string;
  authors: string[];
  version: string;
  path: string;
};

function RouteComponent() {
  const { installation } = Route.useLoaderData();
  const { data: gameVersions } = useQuery(gameVersionsQuery);
  const { data: modTags } = useQuery(modTagsQuery);
  const { data: instMods } = useInstalledMods(installation.path, {
    staleTime: Infinity,
  });
  const { data: modUpdates } = useModUpdates(
    {
      installationId: installation.id,
      params: instMods?.mods?.map((mod) => `${mod.modid}@${mod.version}`).join(",") ?? "",
    },
    {
      enabled: !!instMods?.mods?.length,
      staleTime: Infinity,
    },
  );

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

  const scrollRef = useRef<HTMLDivElement>(null);

  return (
    <div className="grid h-full w-full grid-rows-[min-content_auto] gap-2">
      <div className="flex h-fit flex-wrap items-center gap-2 px-2 pt-0.5 pb-2 max-md:pl-9">
        <SearchInput
          className="h-9"
          onChange={(e) => setSearchText(e.target.value)}
          placeholder="Search mods..."
          value={searchText}
        />
        <Select multiple value={selectedGameVersions}>
          <SelectTrigger className="h-9 w-40">
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
            <SelectValue>
              {selectedGameVersions.length > 0
                ? selectedGameVersions.length > 1
                  ? `${selectedGameVersions.length} versions`
                  : selectedGameVersions[0]
                : null}
            </SelectValue>
          </SelectTrigger>
          <SelectContent align="start" alignItemWithTrigger={false}>
            {gameVersions?.sort(compareSemverDesc).map((version) => (
              <SelectItem
                key={version}
                onClick={() =>
                  selectedGameVersions.includes(version)
                    ? removeGameVersion(version)
                    : addGameVersion(version)
                }
                value={version}
              >
                {version}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select multiple value={selectedModTags}>
          <SelectTrigger className="h-9 w-40">
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
            <SelectValue>
              {selectedModTags.length > 0
                ? selectedModTags.length > 1
                  ? `${selectedModTags.length} tags`
                  : selectedModTags[0].name
                : null}
            </SelectValue>
          </SelectTrigger>
          <SelectContent align="start" alignItemWithTrigger={false}>
            {modTags
              ?.sort((a, b) => stripped(a.name).localeCompare(stripped(b.name)))
              .map((tag) => (
                <SelectItem
                  key={tag.tagid}
                  onClick={() =>
                    selectedModTags.includes(tag) ? removeModTag(tag) : addModTag(tag)
                  }
                  value={tag}
                >
                  {tag.name}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
        <div className="group relative">
          <Label className="bg-background text-muted-foreground pointer-events-none absolute start-1 top-0 z-10 block -translate-y-1/2 px-2 text-xs font-medium group-has-disabled:opacity-50">
            Sort by
          </Label>
          <Select
            onValueChange={(value) => setSortBy(value as ModsFilters["sortBy"])}
            value={sortBy}
          >
            <SelectTrigger>
              {sortBy ? `${sortOptions[sortBy as keyof typeof sortOptions]}` : "Sort by"}
            </SelectTrigger>
            <SelectContent align="start" alignItemWithTrigger={false}>
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
            onValueChange={(value) => setCategory(value as ModsFilters["category"])}
            value={category}
          >
            <SelectTrigger>
              {category
                ? `${categoryOptions[category as keyof typeof categoryOptions]}`
                : "Category"}
            </SelectTrigger>
            <SelectContent align="start" alignItemWithTrigger={false}>
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
          onCheckedChange={(checked) => setOrderDirection(checked ? "descending" : "ascending")}
          textChecked="Desc"
          textUnchecked="Asc"
        />
        <AuthorAutocomplete onChange={(e) => setAuthor(e.target.value)} value={author} />
        <SideToggleGroup />
        {modUpdates && instMods && (
          <UpdateAllButton
            installation={installation}
            installedMods={instMods.mods}
            updates={modUpdates}
          />
        )}
      </div>
      <ScrollArea viewportRef={scrollRef} className="h-full w-full px-4" scrollFade>
        <ModList installation={installation} scrollRef={scrollRef} />
      </ScrollArea>
      <p className="text-muted-foreground absolute bottom-0 left-4 px-1 py-1 text-xs backdrop-blur-sm">
        {installation.name}
      </p>
    </div>
  );
}
