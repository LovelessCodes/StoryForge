import { useForm, useStore } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { platform } from "@tauri-apps/plugin-os";
import clsx from "clsx";
import { FolderPlusIcon } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import z from "zod";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
} from "@/components/ui/select";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAppFolder } from "@/hooks/use-app-folder";
import type { ProgressPayload } from "@/lib/types";
import { compareSemverDesc, zipfolderprefix } from "@/lib/utils";
import { gameVersionsQuery } from "@/routes/mods";

export const versionSchema = z.object({
	version: z.string().min(1),
});

export function AddVersionDialog() {
	const queryClient = useQueryClient();
	const { data: gameVersions } = useQuery(gameVersionsQuery);
	const { appFolder } = useAppFolder();
	const [open, setOpen] = useState(false);
	const listenRef = useRef<UnlistenFn>(null);
	const { data: installedVersions } = useQuery({
		initialData: [],
		queryFn: () => invoke<string[]>("get_installed_versions"),
		queryKey: ["installedVersions"],
	});
	const currentPlatform = platform();

	const availableVersions = gameVersions?.filter(
		(v) => !installedVersions.includes(v),
	);

	const sortedVersions = gameVersions?.sort(compareSemverDesc);

	const { mutateAsync: downloadVersion, isPending } = useMutation({
		mutationFn: async (version: string) => {
			const url = (await invoke("get_download_link", {
				version,
			})) as string;
			if (!url) {
				throw new Error("Download URL not found in response");
			}
			const downloadUrl = url;
			if (!appFolder) {
				throw new Error("App folder not found");
			}
			return invoke("download_and_maybe_extract", {
				destpath: `${appFolder}/versions/${version}`,
				emitevent: `download://version:${version.replace(/\./g, "_")}`,
				extract: true,
				extractdir: `${appFolder}/versions/${version}`,
				url: downloadUrl,
				zipsubfolderprefix: zipfolderprefix(),
			}) as Promise<string>;
		},
		onError: (error, v) => {
			listenRef.current?.();
			toast.error(`Error downloading game version: ${error.message}`, {
				id: `download-game-version-${v}`,
			});
		},
		onMutate: async (v) => {
			toast.loading(`Starting to download game version ${v}...`, {
				id: `download-game-version-${v}`,
			});
			listenRef.current = await listen<ProgressPayload>(
				`download://version:${v.replace(/\./g, "_")}`,
				(event) => {
					const { phase, percent } = event.payload;
					if (phase === "download") {
						toast.loading(
							`Downloading game version ${v}: ${percent?.toFixed(0)}%`,
							{
								id: `download-game-version-${v}`,
							},
						);
					}
					if (phase === "extract") {
						toast.loading(`Extracting game version ${v}`, {
							id: `download-game-version-${v}`,
						});
					}
				},
			);
		},
		onSuccess: (d, v) => {
			listenRef.current?.();
			if (d === "already_downloaded") {
				toast.dismiss(`download-game-version-${v}`);
				return;
			}
			toast.success(`Game version ${v} downloaded`, {
				id: `download-game-version-${v}`,
			});
			queryClient.invalidateQueries({
				queryKey: ["installedVersions"],
			});
			setOpen(false);
		},
	});
	const form = useForm({
		defaultValues: {
			version:
				availableVersions
					?.sort(compareSemverDesc)
					.filter((v) => !v.includes("rc"))[0] ?? "",
		},
		onSubmit: async ({ value }) => {
			await downloadVersion(value.version);
		},
		validators: {
			onChange: versionSchema,
		},
	});

	const version = useStore(form.store, (state) => state.values.version);
	return (
		<Dialog
			onOpenChange={(op) => {
				if (isPending) return;
				if (op === false) form.reset();
				setOpen(op);
			}}
			open={open}
		>
			<DialogTrigger asChild>
				<Button
					className="w-full justify-between cursor-pointer"
					variant="outline"
				>
					<span className="flex text-xs">Add version</span>
					<FolderPlusIcon className="size-4" />
				</Button>
			</DialogTrigger>
			<DialogContent>
				<div className="flex flex-col items-center gap-2">
					<DialogHeader>
						<DialogTitle className="sm:text-center">Add Version</DialogTitle>
						<DialogDescription className="sm:text-center">
							Enter the new version.
						</DialogDescription>
					</DialogHeader>
				</div>
				{currentPlatform === "macos" &&
					sortedVersions &&
					sortedVersions?.indexOf(version) >
						sortedVersions?.indexOf("1.19.0") && (
						<div className="text-destructive">
							Warning: This version is below 1.19.0 and may not be compatible
							with MacOS.
							<br />
							Please refer to{" "}
							<a
								className="underline hover:text-primary"
								href="https://wiki.vintagestory.at/Installing_the_game_on_MacOS#Versions_prior_to_1.19.0:_set_up_using_Homebrew"
								rel="noreferrer"
								target="_blank"
							>
								this article
							</a>
							.
						</div>
					)}
				<div className="space-y-5">
					<div className="space-y-4">
						<form.Field name="version">
							{(field) => (
								<div className="grid gap-2">
									<Tooltip>
										<TooltipTrigger asChild>
											<Label
												className={clsx([
													field.state.meta.errors.length
														? "text-destructive"
														: "",
													"w-fit",
												])}
												htmlFor="version"
											>
												Version
												<span className="text-destructive">*</span>
											</Label>
										</TooltipTrigger>
										<TooltipContent align="start" side="bottom">
											<p className="text-xs">Pick game version</p>
											{field.state.meta.errors.length > 0 &&
												field.state.meta.errors.map((error, index) => (
													<p
														className="text-destructive text-xs"
														// biome-ignore lint/suspicious/noArrayIndexKey: Needed
														key={index}
													>
														{error?.message}
													</p>
												))}
										</TooltipContent>
									</Tooltip>
									<Select
										onValueChange={field.handleChange}
										value={field.state.value}
									>
										<SelectTrigger className="flex gap-1 w-full truncate">
											{field.state.value ?? "Game version"}
										</SelectTrigger>
										<SelectContent align="start">
											{availableVersions
												?.sort(compareSemverDesc)
												.map((version) => (
													<SelectItem key={version} value={version}>
														{version}
													</SelectItem>
												))}
										</SelectContent>
									</Select>
								</div>
							)}
						</form.Field>
					</div>
					<Button
						className="w-full"
						disabled={isPending}
						onClick={() => form.handleSubmit()}
						type="button"
					>
						{isPending ? "Adding Version..." : "Add Version"}
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}
