import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import clsx from "clsx";
import { FolderPlusIcon } from "lucide-react";
import { useId, useRef, useState } from "react";
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
import { Input } from "@/components/ui/input";
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
import { useInstalledVersions } from "@/hooks/use-installed-versions";
import { gameVersionsQuery } from "@/lib/queries";
import type { ProgressPayload } from "@/lib/types";
import {
	compareSemverDesc,
	makeStringFolderSafe,
	zipfolderprefix,
} from "@/lib/utils";
import { useInstallationsStore } from "@/stores/installations";

export const installationSchema = z.object({
	favorite: z.boolean(),
	icon: z.string(),
	id: z.number(),
	index: z.number(),
	name: z.string().min(1, {
		message: "Name is required",
	}),
	path: z.string().min(1, {
		message: "Path is required",
	}),
	startParams: z.string(),
	version: z.string().min(1),
});

export function AddInstallationDialog() {
	const id = useId();
	const { data: gameVersions } = useQuery(gameVersionsQuery);
	const { appFolder } = useAppFolder();
	const [open, setOpen] = useState(false);
	const { addInstallation, installations } = useInstallationsStore();
	const listenRef = useRef<UnlistenFn>(null);
	const { data: installedVersions } = useInstalledVersions();
	const { mutateAsync: downloadVersion } = useMutation({
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
			toast.error(`Error downloading game version: ${error.message}`, {
				id: `download-game-version-${v}`,
			});
			listenRef.current?.();
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
					} else if (phase === "extract") {
						toast.loading(`Extracting game version ${v}...`, {
							id: `download-game-version-${v}`,
						});
					}
				},
			);
		},
		onSuccess: (d, v) => {
			if (d === "already_downloaded") {
				toast.dismiss(`download-game-version-${v}`);
				return;
			}
			toast.success(`Game version ${v} downloaded`, {
				id: `download-game-version-${v}`,
			});
			listenRef.current?.();
		},
	});
	const { mutateAsync: initializeGame } = useMutation({
		mutationFn: (path: string) =>
			invoke("initialize_game", { path }) as Promise<string>,
		onError: (error, path) => {
			toast.error(`Error initializing game: ${error}`, {
				id: `initialize-game-${path}`,
			});
		},
		onMutate: (path) => {
			toast.loading(`Initializing game...`, {
				id: `initialize-game-${path}`,
			});
		},
		onSuccess: (_, path) => {
			toast.success(`Game initialized`, {
				id: `initialize-game-${path}`,
			});
		},
	});
	const form = useForm({
		defaultValues: {
			favorite: false,
			icon: "",
			id: Date.now(),
			index: installations.length,
			name: "",
			path: appFolder ? `${appFolder}/installations/new` : "",
			startParams: "",
			version:
				gameVersions
					?.sort(compareSemverDesc)
					.filter((v) => !v.includes("rc"))[0] ?? "",
		},
		onSubmit: async ({ value }) => {
			if (!installedVersions.includes(value.version)) {
				await downloadVersion(value.version);
			}
			await initializeGame(value.path);
			addInstallation(
				{
					favorite: value.favorite,
					icon: value.icon,
					id: Date.now(),
					index: installations.length,
					lastTimePlayed: 0,
					name: value.name,
					path: value.path,
					startParams: value.startParams,
					totalTimePlayed: 0,
					version: value.version,
				},
				(status) => status && setOpen(false),
			);
		},
		validators: {
			onChange: installationSchema,
		},
	});
	return (
		<Dialog
			onOpenChange={(op) => {
				if (form.state.isSubmitting) return;
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
					<span className="flex text-xs">Add installation</span>
					<FolderPlusIcon className="size-4" />
				</Button>
			</DialogTrigger>
			<DialogContent>
				<div className="flex flex-col items-center gap-2">
					<DialogHeader>
						<DialogTitle className="sm:text-center">
							Add installation
						</DialogTitle>
						<DialogDescription className="sm:text-center">
							Enter the new installation's details.
						</DialogDescription>
					</DialogHeader>
				</div>

				<div className="space-y-5">
					<div className="space-y-4">
						<form.Field name="name">
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
												htmlFor="name"
											>
												Name
												<span className="text-destructive">*</span>
											</Label>
										</TooltipTrigger>
										<TooltipContent align="start" side="bottom">
											<p className="text-xs">Enter server name</p>
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
									<Input
										className={
											field.state.meta.errors.length ? "text-destructive" : ""
										}
										onChange={(e) => {
											field.handleChange(e.target.value);
											if (e.target.value.length > 0 && appFolder) {
												const safeName = makeStringFolderSafe(e.target.value);
												form.setFieldValue(
													"path",
													`${appFolder}/installations/${safeName}`,
												);
											} else {
												form.resetField("path");
											}
										}}
										onKeyUp={(e) => {
											if (e.key === "Enter") {
												e.preventDefault();
												form.handleSubmit();
											}
										}}
										value={field.state.value}
									/>
								</div>
							)}
						</form.Field>
						<form.Field name="startParams">
							{(field) => (
								<div className="grid gap-2">
									<div className="flex items-center">
										<Tooltip>
											<TooltipTrigger asChild>
												<Label
													className={clsx([
														field.state.meta.errors.length
															? "text-destructive"
															: "",
														"w-fit",
													])}
													htmlFor="startParams"
												>
													Start parameters
													<span className="text-muted-foreground text-xs">
														(optional)
													</span>
												</Label>
											</TooltipTrigger>
											<TooltipContent align="start" side="bottom">
												<p className="text-xs">Enter start parameters</p>
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
									</div>
									<Input
										id={`${id}-start-params`}
										onChange={(e) => field.handleChange(e.target.value)}
										onKeyUp={(e) => {
											if (e.key === "Enter") {
												e.preventDefault();
												form.handleSubmit();
											}
										}}
										value={field.state.value}
									/>
								</div>
							)}
						</form.Field>
						<form.Field name="path">
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
												htmlFor="path"
											>
												Path
												<span className="text-destructive">*</span>
											</Label>
										</TooltipTrigger>
										<TooltipContent align="start" side="bottom">
											<p className="text-xs">Enter installation path</p>
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
									<Input
										className={
											field.state.meta.errors.length ? "text-destructive" : ""
										}
										disabled
										value={field.state.value}
									/>
								</div>
							)}
						</form.Field>
						<form.Field name="icon">
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
												htmlFor="icon"
											>
												Icon
												<span className="text-muted-foreground text-xs">
													(optional)
												</span>
											</Label>
										</TooltipTrigger>
										<TooltipContent align="start" side="bottom">
											<p className="text-xs">Enter installation icon</p>
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
									<Input
										className={
											field.state.meta.errors.length ? "text-destructive" : ""
										}
										onChange={(e) => field.handleChange(e.target.value)}
										onKeyUp={(e) => {
											if (e.key === "Enter") {
												e.preventDefault();
												form.handleSubmit();
											}
										}}
										value={field.state.value}
									/>
								</div>
							)}
						</form.Field>
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
											{gameVersions?.sort(compareSemverDesc).map((version) => (
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
						disabled={form.state.isSubmitting}
						onClick={() => form.handleSubmit()}
						type="button"
					>
						{form.state.isSubmitting ? "Adding..." : "Add Installation"}
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}
