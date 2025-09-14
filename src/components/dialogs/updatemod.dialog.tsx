import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { DownloadCloudIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { ProgressPayload } from "@/lib/types";
import type { OutputMod } from "@/routes/install-mods/$id";
import type { Installation } from "@/stores/installations";
import { Button } from "../ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTrigger,
} from "../ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger } from "../ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";

type Release = {
	releaseid: number;
	mainfile: string;
	filename: string;
	fileid: number;
	downloads: number;
	tags: string[];
	modidstr: string;
	modversion: string;
	created: string;
	changelog: string | null;
};

type ModInfo = {
	mod: {
		modid: number;
		assetid: number;
		name: string;
		text: string;
		author: string;
		urlalias: string;
		logofilename: string | null;
		logofile: string | null;
		logofiledb: string | null;
		homepageurl: string | null;
		sourcecodeurl: string | null;
		trailervideourl: string | null;
		issuetrackerurl: string | null;
		wikiurl: string | null;
		downloads: number;
		follows: number;
		trendingpoints: number;
		comments: number;
		side: string;
		type: string;
		created: string;
		lastreleased: string;
		lastmodified: string;
		tags: string[];
		releases: Release[];
		screenshots: string[];
	};
	statuscode: string;
};

export function UpdateModDialog({
	mod,
	installation,
	versionFrom,
	versionTo,
}: {
	mod: OutputMod;
	installation: Installation;
	versionFrom: string;
	versionTo: string;
}) {
	const [open, setOpen] = useState(false);
	const { data: modInfo } = useQuery({
		enabled: open,
		queryFn: () =>
			invoke("fetch_mod_info", { modid: mod.modid }) as Promise<ModInfo>,
		queryKey: ["modInfo", mod.modid],
		refetchOnReconnect: false,
		refetchOnWindowFocus: false,
	});
	const listenRef = useRef<UnlistenFn>(null);
	const [selectedVersion, setSelectedVersion] = useState<Release | null>(versionFrom ? modInfo?.mod.releases.find((r) => r.modversion === versionFrom) || null : null);
	const queryClient = useQueryClient();
	const emitevent = `mod-download-${mod.modid}-${installation.id}`;
	const { mutate: removeModFromInstallation, isPending: removePending } =
		useMutation({
			mutationFn: ({ path, modpath }: { path: string; modpath: string }) =>
				invoke("remove_mod_from_installation", { params: { modpath, path } }),
			onError: (error, variables) => {
				toast.error(
					`Error removing ${name} from ${installation.name}: ${error.message}`,
					{
						id: `mod-remove-${variables.path}-${variables.modpath}`,
					},
				);
			},
			onSuccess: () => {
				addModToInstallation({
					path: `${installation.path}/Mods`,
					url: selectedVersion?.mainfile || "",
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
				`Error ${selectedVersion && selectedVersion.modversion > versionFrom ? "upgrading" : "downgrading"} ${modInfo?.mod.name} to ${installation.name}: ${error.message}`,
				{ id: `add-mod-${modInfo?.mod.modid}-${installation.id}` },
			);
			listenRef.current?.();
		},
		onMutate: async () => {
			toast.loading(`${selectedVersion && selectedVersion.modversion > versionFrom ? "Upgrading" : "Downgrading"} ${modInfo?.mod.name} to ${installation.name}...`, {
				id: `add-mod-${modInfo?.mod.modid}-${installation.id}`,
			});
			listenRef.current = await listen<ProgressPayload>(emitevent, (event) => {
				const { phase, percent } = event.payload;
				if (phase === "download") {
					toast.loading(
						`Downloading ${modInfo?.mod.name} to ${installation.name}... ${percent?.toFixed(0)}%`,
						{ id: `add-mod-${modInfo?.mod.modid}-${installation.id}` },
					);
				}
			});
		},
		onSuccess: () => {
			listenRef.current?.();
			toast.success(
				`Successfully ${selectedVersion && selectedVersion.modversion > versionFrom ? "updated" : "downgraded"} ${modInfo?.mod.name} to ${installation.name}`,
				{ id: `add-mod-${modInfo?.mod.modid}-${installation.id}` },
			);
			queryClient.invalidateQueries({
				queryKey: ["installationMods", installation.path],
			});
			queryClient.invalidateQueries({
				queryKey: ["modUpdates", installation.id],
			});
			setOpen(false);
		},
	});

	useEffect(() => {
		if (modInfo && modInfo.mod.releases.length > 0) {
			const modVersion = modInfo.mod.releases.find((release) =>
				release.tags.includes(installation.version),
			);
			setSelectedVersion(modVersion ? modVersion : null);
		}
	}, [modInfo, installation.version]);

	return (
		<Dialog
			onOpenChange={(op) => {
				if (isPending) return;
				if (op === false) setSelectedVersion(null);
				setOpen(op);
			}}
			open={open}
		>
			<DialogTrigger asChild>
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							aria-label="Delete"
							onClick={() => setOpen(true)}
							size="icon"
							variant="outline"
						>
							<DownloadCloudIcon size={4} />
						</Button>
					</TooltipTrigger>
					<TooltipContent>
						<span className="text-xs text-muted-foreground">
							{versionFrom} → {versionTo}
						</span>
					</TooltipContent>
				</Tooltip>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<h3 className="text-lg font-medium leading-6">
						Update <span className="text-yellow-200">{modInfo?.mod.name}</span>{" "}
						in <span className="text-blue-200">{installation.name}</span>
					</h3>
				</DialogHeader>
				<DialogDescription>
					Select the version of{" "}
					<span className="text-yellow-200">{modInfo?.mod.name}</span> you want
					to update in{" "}
					<span className="text-blue-200">{installation.name}</span>.
				</DialogDescription>
				{/* We need a select, incase the installation version is not compatible */}
				<div className="mt-2 w-full overflow-hidden">
					<Select
						onValueChange={(value) => {
							const release =
								modInfo?.mod.releases.find((r) => r.modversion === value) ||
								null;
							setSelectedVersion(release);
						}}
						value={selectedVersion?.modversion || undefined}
					>
						<SelectTrigger className="w-full truncate">
							<span>
								{selectedVersion?.modversion ? (
									<span>
										{selectedVersion.modversion}{" "}
										<span className="text-muted-foreground">
											for {selectedVersion.tags[0]}{" "}
											{selectedVersion.tags.length > 1
												? `(+${selectedVersion.tags.length - 1} more)`
												: ""}
										</span>
									</span>
								) : (
									"Select Version"
								)}
							</span>
						</SelectTrigger>
						<SelectContent>
							{modInfo?.mod.releases.map((release) => (
								<SelectItem key={release.fileid} value={release.modversion}>
									<div className="flex flex-col">
										<span>
											{release.modversion}
											<span className="text-muted-foreground">
												{" "}
												for {release.tags[0]}{" "}
												{release.tags.length > 1
													? `(+${release.tags.length - 1} more)`
													: ""}
											</span>
										</span>
										<span className="text-xs text-muted-foreground">
											{release.downloads} downloads
										</span>
									</div>
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
				<DialogFooter>
					<Button
						disabled={!selectedVersion || isPending || removePending || selectedVersion.modversion === versionFrom}
						onClick={async () => {
							if (selectedVersion && selectedVersion.modversion !== versionFrom) {
								removeModFromInstallation({
									modpath: mod.path,
									path: installation.path,
								});
							}
						}}
					>
						Update Mod
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
