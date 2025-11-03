import type { Switch as SwitchPrimitive } from "@base-ui-components/react/switch";
import { clsx } from "clsx";
import { forwardRef, useId, useState } from "react";
import { Switch } from "@/components/ui/switch";

type TextSwitchProps = {
	textChecked?: string;
	textUnchecked?: string;
	className?: string | ((active: boolean) => string);
} & Omit<SwitchPrimitive.Root.Props, "className">;

export const TextSwitch = forwardRef<HTMLInputElement, TextSwitchProps>(
	(
		{
			className,
			textChecked,
			textUnchecked,
			checked,
			onCheckedChange,
			...rest
		},
		ref,
	) => {
		const id = useId();
		const [internalChecked, setInternalChecked] = useState<boolean>(false);

		const handleCheckedChange = (
			checked: boolean,
			event: SwitchPrimitive.Root.ChangeEventDetails,
		) => {
			setInternalChecked(checked);
			onCheckedChange?.(checked, event);
		};

		const active = checked ?? internalChecked;

		const computedClassName =
			typeof className === "function" ? className(active) : className;

		return (
			<div className="relative inline-grid h-9 grid-cols-[1fr_1fr] items-center text-sm font-medium">
				<Switch
					checked={active}
					className={clsx([
						"peer data-unchecked:bg-input/50 absolute inset-0 h-[inherit] border w-auto rounded-md [&_span]:z-10 [&_span]:h-full [&_span]:w-1/2 [&_span]:rounded-sm [&_span]:transition-transform [&_span]:duration-300 [&_span]:ease-[cubic-bezier(0.16,1,0.3,1)] [&_span]:data-checked:translate-x-full [&_span]:data-checked:rtl:-translate-x-full",
						computedClassName,
					])}
					id={id}
					inputRef={ref}
					onCheckedChange={handleCheckedChange}
					{...rest}
				/>
				<span className="pointer-events-none relative ms-0.5 flex items-center justify-center px-2 text-center transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] peer-data-checked:invisible peer-data-unchecked:translate-x-full peer-data-unchecked:rtl:-translate-x-full">
					<span className="text-[10px] font-medium uppercase">
						{textUnchecked ?? "Off"}
					</span>
				</span>
				<span className="peer-data-checked:text-background pointer-events-none relative me-0.5 flex items-center justify-center px-2 text-center transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] peer-data-checked:-translate-x-full peer-data-unchecked:invisible peer-data-checked:rtl:translate-x-full">
					<span className="text-[10px] font-medium uppercase">
						{textChecked ?? "On"}
					</span>
				</span>
			</div>
		);
	},
);
