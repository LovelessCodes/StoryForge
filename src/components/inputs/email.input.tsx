import type { Input as InputPrimitive } from "@base-ui/react";
import { MailIcon } from "lucide-react";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupInput,
} from "../ui/input-group";

const EmailInput = ({ className, ...rest }: InputPrimitive.Props) => {
	return (
		<InputGroup>
			<InputGroupInput
				className={className}
				placeholder="me@example.com"
				type="email"
				{...rest}
			/>
			<InputGroupAddon align="inline-end">
				<MailIcon aria-hidden="true" size={16} />
			</InputGroupAddon>
		</InputGroup>
	);
};

EmailInput.displayName = "EmailInput";

export default EmailInput;
