import { formatForDisplay, useHotkey } from "@tanstack/react-hotkeys";
import { Search } from "lucide-react";
import { useRef } from "react";
import { useTranslation } from "react-i18next";

import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group";

export function ModSearchInput({
  className,
  onChange,
  placeholder,
  value,
}: {
  className?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  value: string;
}) {
  const { t } = useTranslation();
  const searchRef = useRef<HTMLInputElement>(null);
  const resolvedPlaceholder = placeholder ?? t("mods.search.placeholder");

  // Mod+K belongs to the global command palette, so the mods browser uses
  // the conventional Mod+F to focus its search field instead.
  useHotkey(
    "Mod+F",
    () => {
      searchRef.current?.focus();
      searchRef.current?.select();
    },
    { conflictBehavior: "allow" },
  );

  return (
    <InputGroup className={className}>
      <InputGroupAddon>
        <Search />
      </InputGroupAddon>
      <InputGroupInput
        ref={searchRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={resolvedPlaceholder}
        aria-label={resolvedPlaceholder}
      />
      <InputGroupAddon align="inline-end">
        <InputGroupText className="gap-0.5">
          <kbd className="font-sans">{formatForDisplay("Mod")}</kbd>
          <kbd className="font-sans">{formatForDisplay("F")}</kbd>
        </InputGroupText>
      </InputGroupAddon>
    </InputGroup>
  );
}
