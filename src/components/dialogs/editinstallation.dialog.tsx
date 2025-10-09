import { useForm } from "@tanstack/react-form";
import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { useId } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
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
import { useDownloadVersion } from "@/hooks/use-download-version";
import { useInstalledVersions } from "@/hooks/use-installed-versions";
import { gameVersionsQuery } from "@/lib/queries";
import { compareSemverDesc, makeStringFolderSafe } from "@/lib/utils";
import { useDialogStore } from "@/stores/dialogs";
import {
	type Installation,
	useInstallationsStore,
} from "@/stores/installations";
import { useSettingsStore } from "@/stores/settings";
import { installationSchema } from "./addinstallation.dialog";

export type EditInstallationDialogProps = {
	installation: Installation;
};

export function EditInstallationDialog({
	open,
	installation,
}: {
	open: boolean;
} & EditInstallationDialogProps) {
	const id = useId();
	const { data: gameVersions } = useQuery(gameVersionsQuery);
	const { closeDialog } = useDialogStore();
	const { data: installedVersions } = useInstalledVersions();
	const { appFolder } = useAppFolder();
	const { installationsParent } = useSettingsStore();
	const { updateInstallation } = useInstallationsStore();
	const { mutateAsync: downloadVersion, isPending } = useDownloadVersion();
	const form = useForm({
		defaultValues: {
			favorite: installation.favorite,
			icon: installation.icon ?? "",
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
				(status) => status && closeDialog(),
			);
		},
		validators: {
			onChange: installationSchema,
		},
	});
	return (
		<Dialog
			onOpenChange={() =>
				!form.state.isSubmitting && !isPending && closeDialog()
			}
			open={open}
		>
			<DialogClose />
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
													`${installationsParent ?? appFolder}/installations/${safeName}`,
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
											<p>
												{field.state.value ?? "Game version"}
												{installedVersions.includes(field.state.value) ? (
													<span className="text-xs text-muted-foreground opacity-50 ml-2">
														(installed)
													</span>
												) : (
													<span className="text-xs text-muted-foreground opacity-50 ml-2">
														(will be downloaded)
													</span>
												)}
											</p>
										</SelectTrigger>
										<SelectContent align="start">
											{gameVersions?.sort(compareSemverDesc).map((version) => (
												<SelectItem
													className={
														installedVersions.includes(version)
															? "bg-success/5"
															: ""
													}
													key={version}
													value={version}
												>
													{version}
													{installedVersions.includes(version) && (
														<span className="text-xs text-muted-foreground opacity-50 ml-2">
															(installed)
														</span>
													)}
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
