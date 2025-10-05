import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import {
	DownloadCloudIcon,
	PackageMinusIcon,
	PackagePlusIcon,
	PackageSearchIcon,
} from "lucide-react";
import { motion } from "motion/react";
import { useRef } from "react";
import { toast } from "sonner";
import type { Mod } from "@/components/lists/mod.list";
import { Button } from "@/components/ui/button";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { installedModsQueryKey } from "@/hooks/use-installed-mods";
import {
	type ModUpdatesResponse,
	modUpdatesQueryKey,
} from "@/hooks/use-mod-updates";
import type { ModInfo, ProgressPayload } from "@/lib/types";
import { cn } from "@/lib/utils";
import type { OutputMod } from "@/routes/install-mods/$id";
import { useDialogStore } from "@/stores/dialogs";
import type { Installation } from "@/stores/installations";
import { useModsFilters } from "@/stores/modsFilters";

export function ModItem({
	mod,
	installedMods,
	modUpdates,
	installation,
}: {
	mod: Mod;
	installedMods: OutputMod[];
	modUpdates: ModUpdatesResponse | undefined;
	installation: Installation | null;
}) {
	const queryClient = useQueryClient();
	const listenRef = useRef<UnlistenFn>(null);
	const emitevent = `mod-download-${mod.modid}-${installation?.id}`;
	const installedMod = installedMods.find(
		(i) =>
			i.modid === mod.modid ||
			i.modid.toString() === mod.urlalias ||
			mod.modidstrs.includes(i.modid.toString()),
	);
	const updateMod =
		modUpdates?.updates[mod.modidstrs[0]] ??
		modUpdates?.updates[mod.modid.toString()] ??
		modUpdates?.updates[mod.urlalias ?? ""];
	const { data: modInfo } = useQuery({
		enabled: !!updateMod,
		queryFn: () =>
			invoke("fetch_mod_info", {
				modid: updateMod?.modidstr,
			}) as Promise<ModInfo>,
		queryKey: ["modInfo", mod.modid],
		refetchOnReconnect: false,
		refetchOnWindowFocus: false,
	});
	const { mutate: removeModFromInstallation, isPending: removePending } =
		useMutation({
			mutationFn: ({ path, modpath }: { path: string; modpath: string }) =>
				invoke("remove_mod_from_installation", { params: { modpath, path } }),
			onError: (error, variables) => {
				toast.error(
					`Error removing ${name} from ${installation?.name}: ${error.message}`,
					{
						id: `mod-remove-${variables.path}-${variables.modpath}`,
					},
				);
			},
			onSuccess: () => {
				addModToInstallation({
					path: `${installation?.path}/Mods`,
					url: updateMod?.mainfile || "",
				});
			},
		});
	const { mutate: addModToInstallation, isPending } = useMutation({
		mutationFn: ({ path, url }: { path: string; url: string }) =>
			invoke("download_and_maybe_extract", {
				destpath: path,
				emitevent,
				extract: false,
				url,
			}) as Promise<string>,
		onError: (error) => {
			toast.error(
				`Error ${installedMod && updateMod && updateMod?.modversion > installedMod?.version ? "upgrading" : "downgrading"} ${modInfo?.mod.name} to ${installation?.name}: ${error.message}`,
				{ id: `add-mod-${modInfo?.mod.modid}-${installation?.id}` },
			);
			listenRef.current?.();
		},
		onMutate: async () => {
			toast.loading(
				`${installedMod && updateMod && updateMod.modversion > installedMod.version ? "Upgrading" : "Downgrading"} ${modInfo?.mod.name} to ${installation?.name}...`,
				{
					id: `add-mod-${modInfo?.mod.modid}-${installation?.id}`,
				},
			);
			listenRef.current = await listen<ProgressPayload>(emitevent, (event) => {
				const { phase, percent } = event.payload;
				if (phase === "download") {
					toast.loading(
						`Downloading ${modInfo?.mod.name} to ${installation?.name}... ${percent?.toFixed(0)}%`,
						{ id: `add-mod-${modInfo?.mod.modid}-${installation?.id}` },
					);
				}
			});
		},
		onSuccess: async () => {
			if (installation === null) return;
			listenRef.current?.();
			toast.success(
				`Successfully ${installedMod && updateMod && updateMod.modversion > installedMod.version ? "updated" : "downgraded"} ${modInfo?.mod.name} to ${installation.name}`,
				{ id: `add-mod-${modInfo?.mod.modid}-${installation.id}` },
			);
			await queryClient.invalidateQueries({
				queryKey: modUpdatesQueryKey(installation.id),
			});
			await queryClient.invalidateQueries({
				queryKey: installedModsQueryKey(installation.path),
			});
		},
	});
	const { openDialog } = useDialogStore();
	const { setAuthor } = useModsFilters();
	return (
		<motion.div
			animate={{ opacity: 1, y: 0 }}
			className={cn([
				"flex flex-row p-2 justify-between w-full items-center",
				installedMod && "bg-gradient-to-r from-green-600/20 to-transparent",
			])}
			exit={{ opacity: 0, y: 12 }}
			initial={{ opacity: 0, y: 12 }}
		>
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
							mod.logo ?? "https://mods.vintagestory.at/web/img/mod-default.png"
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
			<div className="flex items-center">
				{modUpdates?.statuscode === "200" &&
					(Object.keys(modUpdates.updates).includes(mod.modidstrs[0]) ||
						Object.keys(modUpdates.updates).includes(mod.modid.toString()) ||
						Object.keys(modUpdates.updates).includes(mod.urlalias ?? "")) &&
					installation &&
					updateMod?.modversion !== installedMod?.version &&
					installedMod && (
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									aria-label="Delete"
									className="rounded-none shadow-none first:rounded-s-md last:rounded-e-md focus-visible:z-10 text-muted-foreground hover:text-foreground"
									disabled={isPending || removePending}
									onClick={() =>
										removeModFromInstallation({
											modpath: installedMod?.path ?? "",
											path: installation.path,
										})
									}
									size="icon"
									variant="outline"
								>
									<DownloadCloudIcon size={4} />
								</Button>
							</TooltipTrigger>
							<TooltipContent>
								<span className="text-xs text-muted-foreground">
									{installedMod.version} →{" "}
									{modUpdates.updates[mod.modidstrs[0] ?? ""]?.modversion ??
										modUpdates.updates[mod.modid.toString()]?.modversion ??
										modUpdates.updates[mod.urlalias ?? ""]?.modversion ??
										"Unknown"}
								</span>
								<br />
								Install latest version
							</TooltipContent>
						</Tooltip>
					)}
				{installation && installedMod && (
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								aria-label="Delete"
								className="rounded-none shadow-none first:rounded-s-md last:rounded-e-md focus-visible:z-10 text-muted-foreground hover:text-foreground"
								onClick={() =>
									openDialog("UpdateModDialog", {
										installation,
										mod: installedMod,
										versionFrom: installedMod.version,
									})
								}
								size="icon"
								variant="outline"
							>
								<PackageSearchIcon size={4} />
							</Button>
						</TooltipTrigger>
						<TooltipContent>Look through available versions</TooltipContent>
					</Tooltip>
				)}
				{installation &&
					(installedMod ? (
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									aria-label="Remove"
									className="rounded-none shadow-none first:rounded-s-md last:rounded-e-md focus-visible:z-10 text-muted-foreground hover:text-foreground"
									onClick={() =>
										openDialog("RemoveModDialog", {
											installation,
											name: mod.name,
											path: installedMod.path ?? "",
										})
									}
									size="icon"
									variant="destructive"
								>
									<PackageMinusIcon aria-hidden="true" size={4} />
								</Button>
							</TooltipTrigger>
							<TooltipContent>Remove</TooltipContent>
						</Tooltip>
					) : (
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									aria-label="Add Mod"
									className="rounded-none shadow-none first:rounded-s-md last:rounded-e-md focus-visible:z-10 text-muted-foreground hover:text-foreground"
									onClick={() =>
										openDialog("AddModDialog", {
											installation,
											modid: mod.modid,
										})
									}
									size="icon"
									variant="outline"
								>
									<PackagePlusIcon size={4} />
								</Button>
							</TooltipTrigger>
							<TooltipContent>Add Mod</TooltipContent>
						</Tooltip>
					))}
			</div>
		</motion.div>
	);
}
