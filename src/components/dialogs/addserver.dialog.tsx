import { useForm } from "@tanstack/react-form";
import clsx from "clsx";
import { useId } from "react";
import z from "zod";
import { PasswordInput } from "@/components/inputs";
import { Button } from "@/components/ui/button";
import {
	Dialog,
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
import { useDialogStore } from "@/stores/dialogs";
import { type Installation, useInstallations } from "@/stores/installations";
import { useServerStore } from "@/stores/servers";

export const serverSchema = z.object({
	favorite: z.boolean(),
	id: z.number(),
	index: z.number(),
	installationId: z.string().refine((val) => /^\d+$/.test(val), {
		message: "You must select an installation",
	}),
	ip: z.string().min(1),
	name: z.string().min(1),
	password: z.string(),
	port: z
		.string()
		.min(1)
		.max(5)
		.nullable()
		.refine((val) => (val ? /^\d+$/.test(val) : true), {
			message: "Port must be a number",
		}),
});

export type AddServerDialogProps = {
	installation?: Installation;
};

export function AddServerDialog({
	open,
	installation,
}: { open: boolean } & AddServerDialogProps) {
	const id = useId();
	const { closeDialog } = useDialogStore();
	const { installations } = useInstallations();
	const { addServer, servers } = useServerStore();
	const form = useForm({
		defaultValues: {
			favorite: false,
			id: Date.now(),
			index: servers.length,
			installationId: installation?.id.toString() ?? "0",
			ip: "",
			name: "",
			password: "",
			port: null as string | null,
		},
		onSubmit: ({ value }) => {
			addServer(
				{
					favorite: value.favorite,
					id: Date.now(),
					index: servers.length,
					installationId: parseInt(value.installationId, 10),
					ip: value.ip,
					name: value.name,
					password: value.password,
					port: value.port?.length ? parseInt(value.port, 10) : null,
				},
				(status) => {
					if (status) {
						closeDialog();
					}
				},
			);
		},
		validators: {
			onChange: serverSchema,
		},
	});
	return (
		<Dialog onOpenChange={() => closeDialog()} open={open}>
			<DialogContent>
				<div className="flex flex-col items-center gap-2">
					<DialogHeader>
						<DialogTitle className="sm:text-center">Add server</DialogTitle>
						<DialogDescription className="sm:text-center">
							Enter the new server's details.
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
						<form.Field name="password">
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
													htmlFor="password"
												>
													Password
													<span className="text-muted-foreground text-xs">
														(optional)
													</span>
												</Label>
											</TooltipTrigger>
											<TooltipContent align="start" side="bottom">
												<p className="text-xs">Enter password</p>
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
									<PasswordInput
										id={`${id}-password`}
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
						<div className="flex gap-2">
							<form.Field name="ip">
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
													htmlFor="ip"
												>
													IP Address
													<span className="text-destructive">*</span>
												</Label>
											</TooltipTrigger>
											<TooltipContent align="start" side="bottom">
												<p className="text-xs">Enter server IP address</p>
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
							<form.Field name="port">
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
													htmlFor="port"
												>
													Port
													<span className="text-destructive">*</span>
												</Label>
											</TooltipTrigger>
											<TooltipContent align="start" side="bottom">
												<p className="text-xs">Enter server port</p>
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
						</div>
						<form.Field
							name="installationId"
							validators={{
								onSubmit: ({ value }) => {
									if (
										!installations.find((inst) => inst.id.toString() === value)
									) {
										return Error("You must select an installation");
									}
								},
							}}
						>
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
												htmlFor="installationId"
											>
												Installation
												<span className="text-destructive">*</span>
											</Label>
										</TooltipTrigger>
										<TooltipContent align="start" side="bottom">
											<p className="text-xs">Pick game installation</p>
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
											{installations.find(
												(inst) => inst.id.toString() === field.state.value,
											)
												? `${installations.find((inst) => inst.id.toString() === field.state.value)?.name} (${installations.find((inst) => inst.id.toString() === field.state.value)?.version})`
												: "Game installation"}
										</SelectTrigger>
										<SelectContent align="start">
											{installations
												?.sort((a, b) => a.index - b.index)
												.map((installation) => (
													<SelectItem
														key={installation.id}
														value={installation.id.toString()}
													>
														{installation.name} ({installation.version})
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
						onClick={() => form.handleSubmit()}
						type="button"
					>
						Add Server
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}
