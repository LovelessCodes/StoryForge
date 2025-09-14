import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { PackagePlusIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { ProgressPayload } from "@/lib/types";
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

export function AddModDialog({
	modid,
	installation,
}: {
	modid: number;
	installation: Installation;
}) {
	const [open, setOpen] = useState(false);
	const { data: modInfo } = useQuery({
		enabled: open,
		queryFn: () => invoke("fetch_mod_info", { modid: modid.toString() }) as Promise<ModInfo>,
		queryKey: ["modInfo", modid],
		refetchOnReconnect: false,
		refetchOnWindowFocus: false,
	});
	const listenRef = useRef<UnlistenFn>(null);
	const [selectedVersion, setSelectedVersion] = useState<Release | null>(null);
	const queryClient = useQueryClient();
	const emitevent = `mod-download-${modid}-${installation.id}`;
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
				`Error adding ${modInfo?.mod.name} to ${installation.name}: ${error.message}`,
				{ id: `add-mod-${modInfo?.mod.modid}-${installation.id}` },
			);
			listenRef.current?.();
		},
		onMutate: async () => {
			toast.loading(`Adding ${modInfo?.mod.name} to ${installation.name}...`, {
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
				`Successfully added ${modInfo?.mod.name} to ${installation.name}`,
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
							<PackagePlusIcon size={4} />
						</Button>
					</TooltipTrigger>
					<TooltipContent>Add Mod</TooltipContent>
				</Tooltip>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<h3 className="text-lg font-medium leading-6">
						Add <span className="text-yellow-200">{modInfo?.mod.name}</span> to{" "}
						<span className="text-blue-200">{installation.name}</span>
					</h3>
				</DialogHeader>
				<DialogDescription>
					Select the version of{" "}
					<span className="text-yellow-200">{modInfo?.mod.name}</span> you want
					to add to <span className="text-blue-200">{installation.name}</span>.
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
						disabled={!selectedVersion}
						onClick={async () => {
							if (selectedVersion) {
								addModToInstallation({
									path: `${installation.path}/Mods`,
									url: selectedVersion.mainfile,
								});
							}
						}}
					>
						Add Mod
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
