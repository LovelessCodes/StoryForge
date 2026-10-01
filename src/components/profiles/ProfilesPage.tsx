import { FileDown, User } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { useActiveProfile } from "@/hooks/use-active-profile";
import { sortProfiles } from "@/lib/helpers";
import { useProfiles, type Profile } from "@/stores/profiles";

import CairnBanner from "./CairnBanner";
import DeletedProfilesSection from "./DeletedProfilesSection";
import GameDataBanner from "./GameDataBanner";
import ImportProfileSheet from "./ImportProfileSheet";
import LegacyMigrationBanner from "./LegacyMigrationBanner";
import MvlBanner from "./MvlBanner";
import ProfileDialog from "./ProfileDialog";
import ProfileRow from "./ProfileRow";
import VsLauncherBanner from "./VsLauncherBanner";
import WaxlightBanner from "./WaxlightBanner";

export default function ProfilesPage() {
  const { activeProfile } = useActiveProfile();
  const { profiles, loadProfiles } = useProfiles();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Profile | null>(null);
  const [dialogSession, setDialogSession] = useState(0);
  const [importOpen, setImportOpen] = useState(false);

  useEffect(() => {
    void loadProfiles();
  }, [loadProfiles]);

  /** Opens the create/edit sheet; the session key remounts it with the
   *  clicked profile's values pre-filled (state initializers only run on
   *  mount, so a long-lived dialog would keep the first mount's empty form). */
  function openDialog(profile: Profile | null) {
    setEditing(profile);
    setDialogSession((session) => session + 1);
    setDialogOpen(true);
  }

  const sorted = [...profiles].sort((a, b) => {
    if (a.id === activeProfile?.id) return -1;
    if (b.id === activeProfile?.id) return 1;
    return sortProfiles(a, b);
  });

  return (
    <div className="grid gap-6">
      <div className="flex items-center justify-end gap-2">
        <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
          <FileDown /> Import
        </Button>
        <Button variant="accent-primary" size="sm" onClick={() => openDialog(null)}>
          New Profile
        </Button>
      </div>

      <GameDataBanner />
      <LegacyMigrationBanner />
      <VsLauncherBanner />
      <MvlBanner />
      <WaxlightBanner />
      <CairnBanner />

      {profiles.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 border border-dashed p-10 text-center">
          <User className="text-muted-foreground size-6" />
          <div>
            <p className="text-sm font-medium">No profiles yet</p>
            <p className="text-muted-foreground text-xs">
              Create a profile to pick a game version and start adding mods.
            </p>
          </div>
          <Button size="sm" variant="accent-primary" onClick={() => openDialog(null)}>
            Create your first profile
          </Button>
        </div>
      ) : (
        <div className="divide-y border">
          {sorted.map((profile) => (
            <ProfileRow
              isActive={profile.id === activeProfile?.id}
              key={profile.id}
              profile={profile}
              onEdit={(target) => openDialog(target)}
            />
          ))}
        </div>
      )}

      <DeletedProfilesSection />

      <ProfileDialog
        key={dialogSession}
        open={dialogOpen}
        profile={editing}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setEditing(null);
        }}
      />

      <ImportProfileSheet open={importOpen} onOpenChange={setImportOpen} />
    </div>
  );
}
