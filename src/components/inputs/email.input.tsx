import { MailIcon } from "lucide-react";
import { useId } from "react";

import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";

export function EmailInput({ className, ...rest }: React.InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  return (
    <InputGroup>
      <InputGroupInput
        className={className}
        id={id}
        placeholder="me@example.com"
        type="email"
        {...rest}
      />
      <InputGroupAddon align="inline-end">
        <MailIcon aria-hidden="true" size={16} />
      </InputGroupAddon>
    </InputGroup>
  );
}

EmailInput.displayName = "EmailInput";
