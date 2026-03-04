import type { Toggle as TogglePrimitive } from "@base-ui/react/toggle";
import { ToggleGroup as ToggleGroupPrimitive } from "@base-ui/react/toggle-group";
import type { VariantProps } from "class-variance-authority";
import * as React from "react";
import { Separator } from "@/components/ui/separator";
import {
	Toggle as ToggleComponent,
	type toggleVariants,
} from "@/components/ui/toggle";
import { cn } from "@/lib/utils";

const ToggleGroupContext = React.createContext<
	VariantProps<typeof toggleVariants>
>({
	size: "default",
	variant: "default",
});

function ToggleGroup({
	className,
	variant = "default",
	size = "default",
	children,
	...props
}: ToggleGroupPrimitive.Props & VariantProps<typeof toggleVariants>) {
	return (
		<ToggleGroupPrimitive
			className={cn(
				"flex w-fit *:pointer-coarse:after:min-w-auto",
				variant === "default"
					? "gap-0.5"
					: "[--clip-end:-1rem] [--clip-start:-1rem]",
				className,
			)}
			data-size={size}
			data-slot="toggle-group"
			data-variant={variant}
			{...props}
		>
			<ToggleGroupContext.Provider value={{ size, variant }}>
				{children}
			</ToggleGroupContext.Provider>
		</ToggleGroupPrimitive>
	);
}

function Toggle({
	className,
	children,
	variant,
	size,
	...props
}: TogglePrimitive.Props & VariantProps<typeof toggleVariants>) {
	const context = React.useContext(ToggleGroupContext);

	const resolvedVariant = context.variant || variant;
	const resolvedSize = context.size || size;

	return (
		<ToggleComponent
			className={cn(
				resolvedVariant === "outline" &&
					"border-x-0 not-first:rounded-s-none not-last:rounded-e-none before:[clip-path:inset(-1rem_var(--clip-end)_-1rem_var(--clip-start))] not-first:before:-start-0.5 not-first:before:rounded-s-none not-first:before:[--clip-start:2px] not-last:before:-end-0.5 not-last:before:rounded-e-none not-last:before:[--clip-end:2px] first:border-s last:border-e focus-visible:z-10 not-last:has-[+[data-slot=separator]]:before:[--clip-end:1.5px] [[data-slot=separator]+&]:before:[--clip-start:1.5px]",
				className,
			)}
			data-size={resolvedSize}
			data-variant={resolvedVariant}
			size={resolvedSize}
			variant={resolvedVariant}
			{...props}
		>
			{children}
		</ToggleComponent>
	);
}

function ToggleGroupSeparator({ className, ...props }: { className?: string }) {
	return <Separator className={className} orientation="vertical" {...props} />;
}

export { ToggleGroup, Toggle, Toggle as ToggleGroupItem, ToggleGroupSeparator };
