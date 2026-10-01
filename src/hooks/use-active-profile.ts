import { useEffect } from "react";

import { useProfilesStore } from "@/stores/profiles";
import { useSettingsStore } from "@/stores/settings";

/**
 * Resolves the app-wide active profile (persisted in settings) and falls back
 * to the first profile when nothing valid is selected.
 */
export function useActiveProfile() {
  const profiles = useProfilesStore((s) => s.profiles);
  const activeProfileId = useSettingsStore((s) => s.activeProfileId);
  const setActiveProfileId = useSettingsStore((s) => s.setActiveProfileId);

  const activeProfile = profiles.find((p) => p.id === activeProfileId) ?? null;

  useEffect(() => {
    if (profiles.length === 0) return;
    if (!activeProfile) setActiveProfileId(profiles[0].id);
  }, [activeProfile, profiles, setActiveProfileId]);

  return {
    activeProfile,
    activeProfileId: activeProfile?.id ?? null,
    profiles,
    setActiveProfileId,
  };
}
