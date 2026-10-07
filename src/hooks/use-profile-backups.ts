import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";

export type ProfileBackup = {
  /** File name without the extension; the restore/delete handle. */
  id: string;
  /** Creation time in milliseconds since the UNIX epoch. */
  created_at: number;
  size_bytes: number;
  size_display: string;
};

export function profileBackupsQueryKey(profileId: number) {
  return ["profileBackups", profileId] as const;
}

/** Lists the zip snapshots stored for a profile, newest first. */
export function useProfileBackups(profileId: number) {
  return useQuery({
    queryFn: () => invoke<ProfileBackup[]>("list_profile_backups", { profileId }),
    queryKey: profileBackupsQueryKey(profileId),
  });
}
