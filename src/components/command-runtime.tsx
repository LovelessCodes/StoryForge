import { useNavigate } from "@tanstack/react-router";
import { useTheme } from "next-themes";
import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";

import { useActiveProfile } from "@/hooks/use-active-profile";
import { usePlayProfile } from "@/hooks/use-play-profile";
import { openProfilesFolderInFileExplorer } from "@/lib/app-paths";
import { COMMANDS, type AppCommandId, type CommandRuntime } from "@/lib/commands";
import { t } from "@/lib/i18n";
import { queryClient } from "@/lib/query-client";
import { PAGE_PATHS } from "@/lib/routes";
import { switchTheme } from "@/lib/theme-transition";

import { useSidebar } from "./ui/sidebar";
import { notify } from "./ui/toast";

export const CommandRuntimeContext = createContext<CommandRuntime | null>(null);

interface CommandRuntimeProviderProps {
  children: ReactNode;
  onCommandOpenChange: (open: boolean) => void;
}

export function CommandRuntimeProvider({
  children,
  onCommandOpenChange,
}: CommandRuntimeProviderProps) {
  const navigate = useNavigate();
  const { toggleSidebar } = useSidebar();
  const { setTheme } = useTheme();
  const play = usePlayProfile();
  const { activeProfile } = useActiveProfile();

  const runtime = useMemo<CommandRuntime>(
    () => ({
      checkForUpdates: () => {
        void queryClient.invalidateQueries({ queryKey: ["updater"] });
        notify("updater-check", {
          type: "info",
          title: t("layout.updater.checking"),
          timeout: 2500,
        });
      },
      launchProfile: () => {
        if (!activeProfile) {
          notify("launch-no-profile", {
            type: "error",
            title: t("layout.noActiveProfile.title"),
            description: t("layout.noActiveProfile.description"),
          });
          return;
        }
        play.mutate({ id: activeProfile.id });
      },
      navigate: (page) => void navigate({ to: PAGE_PATHS[page] }),
      openCommandPalette: () => onCommandOpenChange(true),
      openProfilesFolder: () => {
        void openProfilesFolderInFileExplorer().catch((err) => {
          notify("profiles-folder", { type: "error", title: String(err) });
        });
      },
      refresh: () => {
        void queryClient.invalidateQueries();
      },
      toggleSidebar,
      toggleTheme: () => {
        const nextTheme = document.documentElement.classList.contains("dark") ? "light" : "dark";
        switchTheme(nextTheme, { setTheme });
      },
    }),
    [activeProfile, navigate, onCommandOpenChange, play, setTheme, toggleSidebar],
  );

  return (
    <CommandRuntimeContext.Provider value={runtime}>{children}</CommandRuntimeContext.Provider>
  );
}

export function useCommandRuntime(): CommandRuntime {
  const runtime = useContext(CommandRuntimeContext);
  if (!runtime) throw new Error("CommandRuntimeProvider is missing");
  return runtime;
}

export function useRunCommand(): (id: AppCommandId) => void {
  const runtime = useCommandRuntime();
  return useCallback((id: AppCommandId) => COMMANDS[id].run(runtime), [runtime]);
}
