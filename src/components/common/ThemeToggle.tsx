import { cn } from "cn";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useCallback, useRef } from "react";

import { elementCenter, switchTheme } from "../../lib/theme-transition";
import { buttonVariants } from "../ui/button";

interface ThemeToggleProps {
  className?: string;
  duration?: number;
}

export default function ThemeToggle({ className, duration = 400 }: ThemeToggleProps) {
  const { resolvedTheme, setTheme } = useTheme();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const isDark = resolvedTheme !== "light";

  const toggleTheme = useCallback(() => {
    // Derive from the DOM so rapid clicks can't race the React render.
    const nextTheme = document.documentElement.classList.contains("dark") ? "light" : "dark";
    switchTheme(nextTheme, {
      duration,
      origin: elementCenter(buttonRef.current),
      setTheme,
    });
  }, [duration, setTheme]);

  return (
    <button
      type="button"
      ref={buttonRef}
      aria-label="Toggle theme"
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      onClick={toggleTheme}
      className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }), className)}
    >
      {isDark ? <Moon /> : <Sun />}
    </button>
  );
}
