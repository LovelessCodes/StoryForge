import { EyeIcon, EyeOffIcon } from "lucide-react";
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";

type PasswordInputProps = {
  className?: string | ((active: boolean) => string);
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "className">;

export function PasswordInput({ className, ...rest }: PasswordInputProps) {
  const id = useId();
  const [visible, setVisible] = useState<boolean>(false);

  const toggleVisibility = () => {
    setVisible((prev) => !prev);
  };

  const computedClassName = typeof className === "function" ? className(visible) : className;

  return (
    <InputGroup>
      <InputGroupInput
        id={id}
        type={visible ? "text" : "password"}
        placeholder="········"
        value={rest.value}
        onChange={rest.onChange}
        className={computedClassName}
      />
      <InputGroupAddon align="inline-end">
        <Button variant="ghost" onClick={toggleVisibility}>
          {visible ? <EyeIcon size={16} /> : <EyeOffIcon size={16} />}
        </Button>
      </InputGroupAddon>
    </InputGroup>
  );
}

PasswordInput.displayName = "PasswordInput";
