import { useForm } from "@tanstack/react-form";
import { useMutation } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import clsx from "clsx";
import { OTPInput, type SlotProps } from "input-otp";
import { UserPlus2 } from "lucide-react";
import { useId } from "react";
import { toast } from "sonner";
import z from "zod";
import { EmailInput, PasswordInput } from "@/components/inputs";
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
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useAccountStore } from "@/stores/accounts";

type SignInResponse = {
	valid: number;
	uid?: string;
	sessionkey?: string;
	sessionsignature?: string;
	mptoken?: string;
	entitlements?: unknown;
	playername?: string;
	hasgameserver?: boolean;
	reason?: string;
};

const signInSchema = z.object({
	email: z.email(),
	password: z
		.string()
		.min(4, { message: "Password must be at least 4 characters long" })
		.max(100, { message: "Password must be at most 100 characters long" }),
	prelogintoken: z.string(),
	totpcode: z
		.string()
		.min(0, {
			message: "TOTP code must be at least either 0 or 6 characters long",
		})
		.max(6, { message: "TOTP code must be 6 digits long" }),
});

export function AddUserDialog() {
	const id = useId();
	const form = useForm({
		defaultValues: {
			email: "",
			password: "",
			prelogintoken: "",
			totpcode: "",
		},
		onSubmit: ({ value }) => {
			signInMutate(value);
		},
		validators: {
			onChange: signInSchema,
		},
	});
	const { addUser, selectedUser } = useAccountStore();
	const {
		mutate: signInMutate,
		error: signInError,
		isPending,
	} = useMutation({
		mutationFn: ({
			email,
			password,
			totpcode,
			prelogintoken,
		}: {
			email: string;
			password: string;
			totpcode: string;
			prelogintoken: string;
		}) =>
			invoke("auth_login", {
				email,
				password,
				prelogintoken,
				totpcode,
			}) as Promise<SignInResponse>,
		onError: (error) => {
			if (error.message === "invalidemailorpassword") {
				toast.error("Invalid email or password", {
					id: `signin-${id}`,
				});
				form.getFieldMeta("email")?.errors.push("Invalid email or password");
				form.getFieldMeta("password")?.errors.push("Invalid email or password");
			} else if (error.message === "requiretotpcode") {
				form.setFieldValue("prelogintoken", error.name);
				toast.info("Please enter your authenticator code to continue.");
			} else if (error.message === "wrongtotpcode") {
				form.setFieldValue("totpcode", "");
				toast.error("Invalid TOTP code – please try again.");
			} else if (error.message === "ipchanged") {
				form.setFieldValue("totpcode", "");
				toast.error("IP address has changed – please try again.");
			} else {
				console.log(error);
				toast.error(`Sign-in failed: ${error?.message || "Unknown error"}`, {
					id: `signin-${id}`,
				});
			}
		},
		onMutate: () => {
			toast.loading("Signing in...", {
				id: `signin-${id}`,
			});
		},
		onSuccess: (data, variables) => {
			toast.success(`Welcome back, ${data.playername || "player"}!`, {
				id: `signin-${id}`,
			});
			addUser({
				email: variables.email,
				playername: data.playername,
				sessionkey: data.sessionkey,
				sessionsignature: data.sessionsignature,
				uid: data.uid,
			});
		},
	});
	return (
		<Dialog>
			<DialogTrigger asChild>
				<Button className="w-full justify-between" variant="outline">
					<span className="flex text-xs">
						{selectedUser ? "Add user" : "Sign in"}
					</span>
					<UserPlus2 className="size-4" />
				</Button>
			</DialogTrigger>
			<DialogContent>
				{signInError?.message === "requiretotpcode" ||
				signInError?.message === "wrongtotpcode" ? (
					<form.Field name="totpcode">
						{(field) => (
							<TOTPComponent
								setValue={(v) => field.handleChange(v)}
								submit={() => form.handleSubmit()}
								value={field.state.value || ""}
							/>
						)}
					</form.Field>
				) : (
					<>
						<div className="flex flex-col items-center gap-2">
							<DialogHeader>
								<DialogTitle className="sm:text-center">
									{selectedUser ? "Add user" : "Welcome back"}
								</DialogTitle>
								<DialogDescription className="sm:text-center">
									{selectedUser
										? "Enter the new user's credentials."
										: "Enter your credentials to sign in to your account."}
								</DialogDescription>
							</DialogHeader>
						</div>

						<div className="space-y-5">
							<div className="space-y-4">
								<form.Field name="email">
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
														htmlFor="email"
													>
														Email
														<span className="text-destructive">*</span>
													</Label>
												</TooltipTrigger>
												<TooltipContent side="bottom">
													<p className="text-xs">Enter email address</p>
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
											<EmailInput
												className={
													field.state.meta.errors.length
														? "text-destructive"
														: ""
												}
												disabled={isPending}
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
															<span className="text-destructive">*</span>
														</Label>
													</TooltipTrigger>
													<TooltipContent side="bottom">
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
												<a
													className="ml-auto inline-block text-sm underline-offset-4 hover:underline"
													href="https://account.vintagestory.at/requestresetpwd"
													rel="noopener noreferrer"
													target="_blank"
												>
													Forgot password?
												</a>
											</div>
											<PasswordInput
												disabled={isPending}
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
							</div>
							<Button
								className="w-full"
								disabled={isPending}
								onClick={() => form.handleSubmit()}
								type="button"
							>
								{isPending ? "Signing in..." : "Sign in"}
							</Button>
						</div>
					</>
				)}
			</DialogContent>
		</Dialog>
	);
}

function TOTPComponent({
	value,
	setValue,
	submit,
}: {
	value: string;
	setValue: (value: string) => void;
	submit: () => Promise<void>;
}) {
	const id = useId();

	return (
		<>
			<div className="flex flex-col items-center gap-2">
				<DialogHeader>
					<DialogTitle className="sm:text-center">
						Enter authenticator code
					</DialogTitle>
					<DialogDescription className="sm:text-center">
						Check the authenticator app and enter the 6-digit code.
					</DialogDescription>
				</DialogHeader>
			</div>
			<div className="space-y-4">
				<div className="flex justify-center">
					<OTPInput
						containerClassName="flex items-center gap-3 has-disabled:opacity-50"
						id={`confirmation-code-${id}`}
						maxLength={6}
						onChange={setValue}
						onComplete={() => submit()}
						render={({ slots }) => (
							<div className="flex gap-2">
								{slots.map((slot, idx) => (
									// biome-ignore lint/suspicious/noArrayIndexKey: Not needed currently
									<Slot key={idx} {...slot} />
								))}
							</div>
						)}
						value={value}
					/>
				</div>
			</div>
		</>
	);
}

function Slot(props: SlotProps) {
	return (
		<div
			className={cn(
				"border-input bg-background text-foreground flex size-9 items-center justify-center rounded-md border font-medium shadow-xs transition-[color,box-shadow]",
				{ "border-ring ring-ring/50 z-10 ring-[3px]": props.isActive },
			)}
		>
			{props.char !== null && <div>{props.char}</div>}
		</div>
	);
}
