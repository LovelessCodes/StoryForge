import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import clsx from "clsx";
import { WrenchIcon } from "lucide-react";
import { useId, useRef, useState } from "react";
import { toast } from "sonner";
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
import { gameVersionsQuery } from "@/lib/queries";
import type { ProgressPayload } from "@/lib/types";
import {
	compareSemverDesc,
	makeStringFolderSafe,
	zipfolderprefix,
} from "@/lib/utils";
import {
	type Installation,
	useInstallationsStore,
} from "@/stores/installations";
import { installationSchema } from "./addinstallation.dialog";

export function EditInstallationDialog({
	installation,
}: {
	installation: Installation;
}) {
	const id = useId();
	const { data: gameVersions } = useQuery(gameVersionsQuery);
	const { data: installedVersions } = useQuery({
		initialData: [],
		queryFn: () => invoke<string[]>("get_installed_versions"),
		queryKey: ["installedVersions"],
	});
	const { appFolder } = useAppFolder();
	const listenRef = useRef<UnlistenFn>(null);
	const [open, setOpen] = useState(false);
	const { updateInstallation } = useInstallationsStore();
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
			listenRef.current?.();
			if (d === "already_downloaded") {
				toast.dismiss(`download-game-version-${v}`);
				return;
			}
			toast.success(`Game version ${v} downloaded`, {
				id: `download-game-version-${v}`,
			});
		},
	});
	const form = useForm({
		defaultValues: {
			favorite: installation.favorite,
			icon: installation.icon,
			id: installation.id,
			index: installation.index,
			name: installation.name,
			path: installation.path,
			startParams: installation.startParams,
			version: installation.version ?? gameVersions?.[0] ?? "1.21.1",
		},
		onSubmit: async ({ value }) => {
			if (!installedVersions.includes(value.version)) {
				await downloadVersion(value.version);
			}
			updateInstallation(
				{
					favorite: value.favorite,
					icon: value.icon?.length ? value.icon : null,
					id: installation.id,
					index: installation.index,
					lastTimePlayed: installation.lastTimePlayed,
					name: value.name,
					path: value.path,
					startParams: value.startParams,
					totalTimePlayed: installation.totalTimePlayed,
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
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							className="rounded-none shadow-none first:rounded-s-md last:rounded-e-md focus-visible:z-10"
							onClick={() => setOpen(true)}
							variant="outline"
						>
							<WrenchIcon
								aria-hidden="true"
								className="-ms-1 opacity-60"
								size={16}
							/>
						</Button>
					</TooltipTrigger>
					<TooltipContent>Edit</TooltipContent>
				</Tooltip>
			</DialogTrigger>
			<DialogContent>
				<div className="flex flex-col items-center gap-2">
					<DialogHeader>
						<DialogTitle className="sm:text-center">
							Edit installation
						</DialogTitle>
						<DialogDescription className="sm:text-center">
							Enter the installation's details.
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
										value={field.state.value ?? ""}
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
						{form.state.isSubmitting ? "Updating..." : "Update Installation"}
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}
