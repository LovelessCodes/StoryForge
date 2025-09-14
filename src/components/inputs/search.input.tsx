import clsx from "clsx";
import { forwardRef, useId } from "react";
import { Input } from "@/components/ui/input";

type SearchInputProps = {
	className?: string | ((active: boolean) => string);
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "className">;

export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(
	({ className, ...rest }, ref) => {
		const id = useId();
		return (
			<div className="relative">
				<Input
					className={clsx(["pe-11", className])}
					id={id}
					placeholder="Search..."
					ref={ref}
					type="search"
					{...rest}
				/>
				<div className="text-muted-foreground pointer-events-none absolute inset-y-0 end-0 flex items-center justify-center pe-2">
					<kbd className="text-muted-foreground/70 inline-flex h-5 max-h-full items-center rounded border px-1 font-[inherit] text-[0.625rem] font-medium">
						⌘K
					</kbd>
				</div>
			</div>
		);
	},
);
