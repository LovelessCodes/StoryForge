import { clsx } from "clsx";
import { MailIcon } from "lucide-react";
import { forwardRef, useId } from "react";
import { Input } from "@/components/ui/input";

const EmailInput = forwardRef<
	HTMLInputElement,
	React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...rest }, ref) => {
	const id = useId();
	return (
		<div className="relative">
			<Input
				className={clsx(["peer pe-9", className])}
				id={id}
				placeholder="me@example.com"
				ref={ref}
				type="email"
				{...rest}
			/>
			<div className="text-muted-foreground/80 pointer-events-none absolute inset-y-0 end-0 flex items-center justify-center pe-3 peer-disabled:opacity-50">
				<MailIcon aria-hidden="true" size={16} />
			</div>
		</div>
	);
});

EmailInput.displayName = "EmailInput";

export default EmailInput;
