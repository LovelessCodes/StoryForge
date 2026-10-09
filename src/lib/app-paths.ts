import { invoke } from "@tauri-apps/api/core";
import { appDataDir } from "@tauri-apps/api/path";

import { buildProfilesPath } from "@/lib/helpers";
import { useSettingsStore } from "@/stores/settings";

/** Resolves the folder that holds all profiles (honours the settings override). */
export async function resolveProfilesDir(): Promise<string> {
  const { profilesParent, profilesSubdir } = useSettingsStore.getState();
  const base = profilesParent ?? (await appDataDir());
  return buildProfilesPath(base, profilesSubdir);
}

export async function revealPath(path: string): Promise<void> {
  await invoke("reveal_in_file_explorer", { path });
}

export async function openProfilesFolderInFileExplorer(): Promise<void> {
  await revealPath(await resolveProfilesDir());
}
