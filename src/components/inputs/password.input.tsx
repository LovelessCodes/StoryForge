import { clsx } from "clsx";
import { EyeIcon, EyeOffIcon } from "lucide-react";
import { forwardRef, useId, useState } from "react";
import { Input } from "@/components/ui/input";

type PasswordInputProps = {
	className?: string | ((active: boolean) => string);
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "className">;

const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
	({ className, ...rest }, ref) => {
		const id = useId();
		const [visible, setVisible] = useState<boolean>(false);

		const toggleVisibility = () => {
			setVisible((prev) => !prev);
		};

		const computedClassName =
			typeof className === "function" ? className(visible) : className;

		return (
			<div className="relative">
				<Input
					className={clsx(["pe-9", computedClassName])}
					id={id}
					placeholder={visible ? "p4zzw0rd" : "········"}
					ref={ref}
					type={visible ? "text" : "password"}
					{...rest}
				/>
				<button
					aria-controls="password"
					aria-label={visible ? "Hide password" : "Show password"}
					aria-pressed={visible}
					className="text-muted-foreground/80 hover:text-foreground focus-visible:border-ring focus-visible:ring-ring/50 absolute inset-y-0 end-0 flex h-full w-9 items-center justify-center rounded-e-md transition-[color,box-shadow] outline-none focus:z-10 focus-visible:ring-[3px] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50"
					onClick={toggleVisibility}
					tabIndex={-1}
					type="button"
				>
					{visible ? (
						<EyeOffIcon aria-hidden="true" size={16} />
					) : (
						<EyeIcon aria-hidden="true" size={16} />
					)}
				</button>
			</div>
		);
	},
);

PasswordInput.displayName = "PasswordInput";

export default PasswordInput;
