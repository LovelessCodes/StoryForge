import clsx from "clsx";
import { forwardRef, useEffect, useId, useRef } from "react";

import { Input } from "@/components/ui/input";
import { modifierLabel } from "@/lib/utils";

type SearchInputProps = {
  className?: string | ((active: boolean) => string);
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "className">;

export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(
  ({ className, ...rest }) => {
    const id = useId();
    const searchRef = useRef<HTMLInputElement>(null);
    useEffect(() => {
      // Add a keyboard shortcut to focus the search input
      // This will listen for the "⌘K" key combination and focus the input
      const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key === "k" && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          searchRef.current?.focus();
        }
      };
      window.addEventListener("keydown", handleKeyDown);
      return () => {
        window.removeEventListener("keydown", handleKeyDown);
      };
    }, []);
    return (
      <div className="relative">
        <Input
          className={clsx(["pe-11", className])}
          id={id}
          placeholder="Search..."
          type="search"
          {...rest}
        />
        <div className="text-muted-foreground pointer-events-none absolute inset-y-0 end-0 flex items-center justify-center pe-2">
          <kbd className="text-muted-foreground/70 inline-flex h-5 max-h-full items-center rounded border px-1 font-[inherit] text-[0.625rem] font-medium">
            {modifierLabel}K
          </kbd>
        </div>
      </div>
    );
  },
);
