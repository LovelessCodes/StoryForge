import { useQuery } from "@tanstack/react-query";
import { measureElement, useVirtualizer } from "@tanstack/react-virtual";
import { invoke } from "@tauri-apps/api/core";
import { useCallback } from "react";
import { useInstalledMods } from "@/hooks/use-installed-mods";
import { useModUpdates } from "@/hooks/use-mod-updates";
import type { Installation } from "@/stores/installations";
import { useModsFilters } from "@/stores/modsFilters";
import { ModItem } from "../items/mod.item";

type ModsParams = {
	versions: string[];
	search: string;
};

export type Mod = {
	modid: number;
	assetid: number;
	downloads: number;
	follows: number;
	trendingpoints: number;
	comments: number;
	name: string;
	summary: string;
	modidstrs: string[];
	author: string;
	urlalias: string | null;
	side: string;
	type: string;
	logo: string | null;
	tags: string[];
	lastreleased: string;
};

const modsQuery = (params: ModsParams) => ({
	keepPreviousData: true,
	queryFn: () => invoke("fetch_mods", { options: params }) as Promise<Mod[]>,
	queryKey: ["mods", params],
	refetchOnWindowFocus: false,
});

export function ModList({
	parentRef,
	installation,
}: {
	parentRef: React.RefObject<HTMLDivElement | null>;
	installation: Installation | null;
}) {
	const {
		searchText,
		selectedModTags,
		selectedGameVersions,
		sortBy,
		orderDirection,
		author,
		side,
		category,
	} = useModsFilters();
	const { data: mods } = useQuery(
		modsQuery({
			search: searchText,
			versions: selectedGameVersions.map((version) => version),
		}),
	);
	const { data: instMods } = useInstalledMods(installation?.path ?? "", {
		enabled: !!installation,
	});
	const installedMods = instMods?.mods ?? [];
	const { data: modUpdates } = useModUpdates(
		{
			installationId: installation?.id ?? -1,
			params:
				installedMods?.map((mod) => `${mod.modid}@${mod.version}`).join(",") ??
				"",
		},
		{
			enabled: !!installedMods.length,
		},
	);

	// If sortOrder is descending, reverse the modsList
	const modsList = mods
		?.filter((mod) => {
			if (selectedModTags.length > 0) {
				return selectedModTags.every((tag) => mod.tags.includes(tag.name));
			}
			return true;
		})
		?.filter((mod) => {
			if (author) {
				return mod.author === author;
			}
			return true;
		})
		?.filter((mod) => mod.type === category)
		?.filter((mod) =>
			side !== "installed"
				? mod.side === side
				: installedMods.some(
						(installedMod) =>
							installedMod.modid === mod.modid ||
							installedMod.modid.toString() === mod.urlalias ||
							mod.modidstrs.includes(installedMod.modid.toString()),
					),
		)
		.sort((a, b) => {
			if (side === "installed") {
				if (orderDirection === "descending") {
					return a.side === "both"
						? -1
						: b.side === "both"
							? 1
							: installedMods.some(
										(installedMod) =>
											installedMod.modid === a.modid ||
											installedMod.modid.toString() === a.urlalias ||
											a.modidstrs.includes(installedMod.modid.toString()),
									)
								? -1
								: installedMods.some(
											(installedMod) =>
												installedMod.modid === b.modid ||
												installedMod.modid.toString() === b.urlalias ||
												b.modidstrs.includes(installedMod.modid.toString()),
										)
									? 1
									: 0;
				}
				return a.side === "both"
					? 1
					: b.side === "both"
						? -1
						: installedMods.some(
									(installedMod) =>
										installedMod.modid === a.modid ||
										installedMod.modid.toString() === a.urlalias ||
										a.modidstrs.includes(installedMod.modid.toString()),
								)
							? 1
							: installedMods.some(
										(installedMod) =>
											installedMod.modid === b.modid ||
											installedMod.modid.toString() === b.urlalias ||
											b.modidstrs.includes(installedMod.modid.toString()),
									)
								? -1
								: 0;
			}
			if (sortBy === "name") {
				if (orderDirection === "descending") {
					return b.name.localeCompare(a.name);
				}
				return a.name.localeCompare(b.name);
			}
			if (sortBy === "updated") {
				if (orderDirection === "descending") {
					return (
						new Date(b.lastreleased).getTime() -
						new Date(a.lastreleased).getTime()
					);
				}
				return (
					new Date(a.lastreleased).getTime() -
					new Date(b.lastreleased).getTime()
				);
			}
			if (sortBy === "downloads") {
				if (orderDirection === "descending") {
					return a.downloads - b.downloads;
				}
				return b.downloads - a.downloads;
			}
			if (sortBy === "follows") {
				if (orderDirection === "descending") {
					return a.follows - b.follows;
				}
				return b.follows - a.follows;
			}
			if (sortBy === "trending") {
				if (orderDirection === "descending") {
					return a.trendingpoints - b.trendingpoints;
				}
				return b.trendingpoints - a.trendingpoints;
			}
			if (sortBy === "comments") {
				if (orderDirection === "descending") {
					return a.comments - b.comments;
				}
				return b.comments - a.comments;
			}
			if (orderDirection === "descending") {
				return 0;
			}
			return -1;
		});

	const estimateSize = useCallback(() => 81, []);

	const rowVirtualizer = useVirtualizer({
		count: modsList?.length || 0,
		estimateSize,
		getScrollElement: () => parentRef.current,
		measureElement,
		overscan: 20,
	});

	const items = rowVirtualizer.getVirtualItems();
	const totalSize = rowVirtualizer.getTotalSize();

	return (
		<div
			className="relative"
			style={{
				height: totalSize,
			}}
		>
			{modsList &&
				items.map((item) => {
					const mod = modsList[item.index];
					return (
						<div
							className="not-last:border-b flex gap-2 absolute top-0 left-0 w-full"
							data-index={item.index}
							key={mod.modid}
							ref={rowVirtualizer.measureElement}
							style={{
								transform: `translateY(${item.start}px)`,
								willChange: "transform",
							}}
						>
							<ModItem
								installation={installation}
								installedMods={installedMods}
								mod={mod}
								modUpdates={modUpdates}
							/>
						</div>
					);
				})}
		</div>
	);
}
