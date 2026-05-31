import { formatForDisplay, useHotkey } from "@tanstack/react-hotkeys";
import { useId, useRef } from "react";

import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Kbd } from "@/components/ui/kbd";

export function SearchInput({ className, ...rest }: React.InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  const searchRef = useRef<HTMLInputElement>(null);

  useHotkey("Mod+K", () => {
    searchRef.current?.focus();
  });

  return (
    <InputGroup className="w-fit">
      <InputGroupInput ref={searchRef} id={id} className={className} {...rest} />
      <InputGroupAddon align="inline-end">
        <Kbd>{formatForDisplay("Mod")}</Kbd>
        <Kbd>{formatForDisplay("K")}</Kbd>
      </InputGroupAddon>
    </InputGroup>
  );
}
