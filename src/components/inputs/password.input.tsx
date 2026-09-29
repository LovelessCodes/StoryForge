import { EyeIcon, EyeOffIcon } from "lucide-react";
import { useId, useState } from "react";

import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";

type PasswordInputProps = {
  className?: string | ((active: boolean) => string);
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "className">;

export function PasswordInput({ className, ...rest }: PasswordInputProps) {
  const id = useId();
  const [visible, setVisible] = useState<boolean>(false);

  const computedClassName = typeof className === "function" ? className(visible) : className;

  return (
    <InputGroup>
      <InputGroupInput
        id={id}
        placeholder="········"
        {...rest}
        className={computedClassName}
        type={visible ? "text" : "password"}
      />
      <InputGroupAddon align="inline-end">
        <button
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          className="cursor-pointer"
          onClick={() => setVisible((prev) => !prev)}
          type="button"
        >
          {visible ? <EyeIcon size={12} /> : <EyeOffIcon size={12} />}
        </button>
      </InputGroupAddon>
    </InputGroup>
  );
}

PasswordInput.displayName = "PasswordInput";
