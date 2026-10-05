import { invoke } from "@tauri-apps/api/core";
import { appDataDir } from "@tauri-apps/api/path";

import { buildProfilePath, compareSemverDesc, makeStringFolderSafe } from "@/lib/helpers";
import { t } from "@/lib/i18n";
import { useProfilesStore } from "@/stores/profiles";
import { useSettingsStore } from "@/stores/settings";

/** Newest version, preferring non-release-candidates. */
function pickVersion(versions: string[]): string {
  const sorted = versions.filter(Boolean).toSorted(compareSemverDesc);
  return sorted.find((version) => !version.includes("rc")) ?? sorted[0] ?? "";
}

/**
 * Ensures the app never starts without a profile: when the list is empty, a
 * "Default" profile is created and pinned to the newest installed game
 * version (falling back to the newest available release).
 *
 * Skips creation when no version can be determined (offline with no installed
 * versions) — the Profiles page empty state guides setup in that case.
 */
export async function ensureDefaultProfile(): Promise<void> {
  if (useProfilesStore.getState().profiles.length > 0) return;
  await useProfilesStore.getState().loadProfiles();
  if (useProfilesStore.getState().profiles.length > 0) return;

  let version = "";
  try {
    const installed = await invoke<{ name: string }[]>("get_installed_versions");
    version = pickVersion(installed.map((entry) => entry.name));
  } catch {
    // Offline or scan failure — try the release list below.
  }
  if (!version) {
    try {
      version = pickVersion(await invoke<string[]>("fetch_versions"));
    } catch {
      // No network either; fall through.
    }
  }
  if (!version) return;

  const defaultName = t("common.defaultProfileName");

  try {
    const appFolder = await appDataDir();
    const { profilesParent, profilesSubdir } = useSettingsStore.getState();
    const path = buildProfilePath(
      profilesParent ?? appFolder,
      makeStringFolderSafe(defaultName),
      profilesSubdir,
    );
    await invoke("initialize_game", { path });
    await invoke("save_profile", {
      path,
      name: defaultName,
      version,
      startParams: "",
      favorite: false,
      icon: null,
      envVars: {},
    });
    await useProfilesStore.getState().loadProfiles();
    const created = useProfilesStore.getState().profiles.find((p) => p.path === path);
    if (created) useSettingsStore.getState().setActiveProfileId(created.id);
  } catch (error) {
    // Never block startup on this convenience profile.
    console.error("Failed to create the default profile:", error);
  }
}
