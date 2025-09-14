import { useQuery } from "@tanstack/react-query";
import { measureElement, useVirtualizer } from "@tanstack/react-virtual";
import { invoke } from "@tauri-apps/api/core";
import { useCallback } from "react";
import { AddModDialog } from "@/components/dialogs/addmod.dialog";
import { RemoveModDialog } from "@/components/dialogs/removemod.dialog";
import { UpdateModDialog } from "@/components/dialogs/updatemod.dialog";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { useInstalledMods } from "@/hooks/use-installed-mods";
import { useModUpdates } from "@/hooks/use-mod-updates";
import { cn } from "@/lib/utils";
import type { Installation } from "@/stores/installations";
import { useModsFilters } from "@/stores/modsFilters";

type ModsParams = {
	versions: string[];
	search: string;
};

type Mod = {
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
		setAuthor,
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
					const installedMod = installedMods.find(
						(i) =>
							i.modid === mod.modid ||
							i.modid.toString() === mod.urlalias ||
							mod.modidstrs.includes(i.modid.toString()),
					);
					return (
						<div
							className={cn([
								"border-b border-b-muted p-2 flex gap-2 absolute top-0 left-0 w-full",
								installedMod && "bg-green-200/15",
							])}
							data-index={item.index}
							key={mod.modid}
							ref={rowVirtualizer.measureElement}
							style={{
								transform: `translateY(${item.start}px)`,
								willChange: "transform",
							}}
						>
							<div className="flex flex-row justify-between w-full items-center">
								<div className="flex flex-row gap-2">
									<a
										href={`https://mods.vintagestory.at/${mod.urlalias ?? "#"}`}
										rel="noreferrer"
										target="_blank"
									>
										<img
											alt={mod.name}
											className="w-12 h-12 rounded hover:scale-105 transition-transform"
											loading="lazy"
											src={
												mod.logo ??
												"https://mods.vintagestory.at/web/img/mod-default.png"
											}
										/>
									</a>
									<div className="flex flex-col">
										<div className="flex gap-1 items-center">
											<a
												className="hover:underline font-semibold"
												href={`https://mods.vintagestory.at/${mod.urlalias ?? "#"}`}
												rel="noreferrer"
												target="_blank"
											>
												<h3 className="font-semibold">{mod.name}</h3>
											</a>
											<p className="text-xs opacity-50">by</p>
											<TooltipProvider>
												<Tooltip>
													<TooltipTrigger asChild>
														{/** biome-ignore lint/a11y/noStaticElementInteractions: Not really relevant */}
														<span
															className="text-xs opacity-50 text-orange-200 cursor-pointer"
															onClick={() => setAuthor(mod.author)}
															onKeyUp={(e) => {
																if (e.key === "Enter") {
																	setAuthor(mod.author);
																}
															}}
														>
															{mod.author}
														</span>
													</TooltipTrigger>
													<TooltipContent>
														Click to filter by author {mod.author}
													</TooltipContent>
												</Tooltip>
											</TooltipProvider>
										</div>
										<p className="text-sm text-muted-foreground line-clamp-1">
											{mod.summary}
										</p>
										<div className="flex gap-2 text-xs text-muted-foreground mt-1">
											<span>{mod.downloads} downloads</span>
											<span>{mod.follows} follows</span>
											<span>{mod.comments} comments</span>
										</div>
									</div>
								</div>
								<div className="flex gap-2 items-center">
									{modUpdates?.statuscode === "200" &&
										(Object.keys(modUpdates.updates).includes(
											mod.modidstrs[0],
										) ||
											Object.keys(modUpdates.updates).includes(
												mod.modid.toString(),
											) ||
											Object.keys(modUpdates.updates).includes(
												mod.urlalias ?? "",
											)) &&
										installation &&
										installedMod && (
											<UpdateModDialog
												installation={installation}
												mod={installedMod}
												versionFrom={installedMod.version}
												versionTo={
													modUpdates.updates[mod.modidstrs[0]].modversion
												}
											/>
										)}
									{installation &&
										(installedMod ? (
											<RemoveModDialog
												installation={installation}
												name={mod.name}
												path={installedMod.path ?? ""}
											/>
										) : (
											<AddModDialog
												installation={installation}
												modid={mod.modid}
											/>
										))}
								</div>
							</div>
						</div>
					);
				})}
		</div>
	);
}
