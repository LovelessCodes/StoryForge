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
import { useTranslation } from "react-i18next";

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

const GROUP_ORDER: ReadonlyArray<string> = [
  "layout.commands.groups.goTo",
  "layout.commands.groups.application",
  "layout.commands.groups.appearance",
  "layout.commands.groups.game",
];

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

const groups = GROUP_ORDER.map((groupKey) => ({
  groupKey,
  ids: (Object.keys(COMMANDS) as AppCommandId[]).filter(
    (id) => getCommand(id).groupKey === groupKey,
  ),
})).filter((entry) => entry.ids.length > 0);

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const runCommand = useRunCommand();
  const { t } = useTranslation();
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
        <CommandInput placeholder={t("layout.commandPalette.placeholder")} />
        <CommandList>
          <CommandEmpty>{t("layout.commandPalette.empty")}</CommandEmpty>
          {groups.map((entry, index) => (
            <div key={entry.groupKey}>
              {index > 0 && <CommandSeparator />}
              <CommandGroup heading={t(entry.groupKey)}>
                {entry.ids.map((id) => {
                  const command = getCommand(id);

                  if (id === "app.toggleTheme") {
                    return (
                      <CommandItem
                        key={id}
                        ref={themeItemRef}
                        value={t("layout.commands.toggleTheme.title")}
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
                        {t("layout.commandPalette.switchToTheme", {
                          title: t(command.titleKey),
                          theme: isDark ? t("layout.theme.light") : t("layout.theme.dark"),
                        })}
                      </CommandItem>
                    );
                  }

                  const Icon = iconById[id] ?? Search;
                  return (
                    <CommandItem key={id} value={t(command.titleKey)} onSelect={() => go(id)}>
                      <Icon />
                      {t(command.titleKey)}
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
