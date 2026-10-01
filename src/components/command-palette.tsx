import {
  Boxes,
  Earth,
  FileText,
  FolderOpen,
  Layers,
  Moon,
  Newspaper,
  Package,
  IdCard,
  PanelLeft,
  Play,
  RefreshCw,
  Search,
  Server,
  Settings,
  Sun,
  type LucideIcon,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useRef } from "react";

import { COMMANDS, getCommand, type AppCommandId } from "../lib/commands";
import { elementCenter, switchTheme } from "../lib/theme-transition";
import { useRunCommand } from "./command-runtime";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "./ui/command";

const GROUP_ORDER: ReadonlyArray<string> = ["Go to", "Application", "Appearance", "Game"];

const iconById: Partial<Record<AppCommandId, LucideIcon>> = {
  "app.commandPalette": Search,
  "app.toggleSidebar": PanelLeft,
  "app.checkForUpdates": RefreshCw,
  "app.refresh": RefreshCw,
  "app.openProfilesFolder": FolderOpen,
  "app.launchProfile": Play,
  "nav.profiles": IdCard,
  "nav.mods": Package,
  "nav.modpacks": Layers,
  "nav.versions": Boxes,
  "nav.worlds": Earth,
  "nav.servers": Server,
  "nav.config": FileText,
  "nav.news": Newspaper,
  "nav.settings": Settings,
};

const groups = GROUP_ORDER.map((group) => ({
  group,
  ids: (Object.keys(COMMANDS) as AppCommandId[]).filter((id) => getCommand(id).group === group),
})).filter((entry) => entry.ids.length > 0);

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const runCommand = useRunCommand();
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme !== "light";
  const themeItemRef = useRef<HTMLDivElement>(null);
  const pendingThemeRef = useRef<{
    theme: "light" | "dark";
    origin?: { x: number; y: number };
  } | null>(null);

  useEffect(() => {
    const selector = '[data-slot="command-dialog"]';
    const pending = pendingThemeRef.current;
    const shouldReveal = !open && pending !== null;
    if (shouldReveal) pendingThemeRef.current = null;

    let done = false;
    let fallback: ReturnType<typeof setTimeout> | undefined;

    const reveal = () => {
      if (done || !pending) return;
      done = true;
      observer.disconnect();
      clearTimeout(fallback);
      switchTheme(pending.theme, { origin: pending.origin, setTheme });
    };

    const observer = new MutationObserver(() => {
      if (!document.querySelector(selector)) reveal();
    });

    // The dialog stays mounted while its exit animation runs, so wait for it
    // to leave the DOM (with a safety net) before revealing the new theme.
    if (shouldReveal && document.querySelector(selector)) {
      observer.observe(document.body, { childList: true, subtree: true });
      fallback = setTimeout(reveal, 1000);
    } else if (shouldReveal) {
      reveal();
    }

    return () => {
      observer.disconnect();
      clearTimeout(fallback);
    };
  }, [open, setTheme]);

  function go(id: AppCommandId) {
    onOpenChange(false);
    runCommand(id);
  }

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <Command>
        <CommandInput placeholder="Search Story Forge..." />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          {groups.map((entry, index) => (
            <div key={entry.group}>
              {index > 0 && <CommandSeparator />}
              <CommandGroup heading={entry.group}>
                {entry.ids.map((id) => {
                  const command = getCommand(id);

                  if (id === "app.toggleTheme") {
                    return (
                      <CommandItem
                        key={id}
                        ref={themeItemRef}
                        value={`toggle theme ${isDark ? "light" : "dark"}`}
                        onSelect={() => {
                          // Derive from the DOM so the label and action can't disagree.
                          const nextTheme = document.documentElement.classList.contains("dark")
                            ? "light"
                            : "dark";
                          pendingThemeRef.current = {
                            theme: nextTheme,
                            origin: elementCenter(themeItemRef.current),
                          };
                          onOpenChange(false);
                        }}
                      >
                        {isDark ? <Sun /> : <Moon />}
                        {command.title} — switch to {isDark ? "light" : "dark"}
                      </CommandItem>
                    );
                  }

                  const Icon = iconById[id] ?? Search;
                  return (
                    <CommandItem key={id} value={command.title} onSelect={() => go(id)}>
                      <Icon />
                      {command.title}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </div>
          ))}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
