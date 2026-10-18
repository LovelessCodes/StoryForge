import type { Mod, OutputMod } from "@/lib/types";
import type { Profile } from "@/stores/profiles";

import { AddModSheet } from "./AddModSheet";
import { BlockedAuthorsSheet } from "./BlockedAuthorsSheet";
import { RemoveModSheet } from "./RemoveModSheet";
import { StandaloneInstallPickerSheet } from "./StandaloneInstallPickerSheet";
import { UpdateModSheet } from "./UpdateModSheet";

/** The sheet `ModsPage` currently wants open, with the mod it acts on. */
export type SheetRequest =
  | { kind: "add"; mod: Mod; version?: string }
  | { kind: "update"; mod: Mod; installedMod: OutputMod }
  | { kind: "remove"; mod: Mod; installedMod: OutputMod }
  | { kind: "standalone"; mod: Mod; prompt?: boolean; version?: string };

/** The add/update/remove/standalone sheets and the blocked-authors sheet. */
export function ModSheetHost({
  activeProfile,
  blockedOpen,
  destinationLabel,
  modsDirectory,
  onBlockedOpenChange,
  onOpenChange,
  open,
  sheet,
}: {
  activeProfile: Profile | null;
  blockedOpen: boolean;
  destinationLabel: string;
  /** Profile root the sheets install into, update and remove from. */
  modsDirectory: string | undefined;
  onBlockedOpenChange: (open: boolean) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  sheet: SheetRequest | null;
}) {
  return (
    <>
      {sheet?.kind === "add" && modsDirectory && (
        <AddModSheet
          destinationLabel={destinationLabel}
          initialVersion={sheet.version}
          key={sheet.mod.modid}
          mod={sheet.mod}
          modsDirectory={modsDirectory}
          onOpenChange={onOpenChange}
          open={open}
        />
      )}
      {sheet?.kind === "update" && modsDirectory && (
        <UpdateModSheet
          destinationLabel={destinationLabel}
          installedMod={sheet.installedMod}
          key={sheet.mod.modid}
          mod={sheet.mod}
          modsDirectory={modsDirectory}
          onOpenChange={onOpenChange}
          open={open}
        />
      )}
      {sheet?.kind === "remove" && modsDirectory && (
        <RemoveModSheet
          destinationLabel={destinationLabel}
          key={sheet.mod.modid}
          modpath={sheet.installedMod.path}
          modsDirectory={modsDirectory}
          name={sheet.mod.name}
          onOpenChange={onOpenChange}
          open={open}
        />
      )}
      {sheet?.kind === "standalone" && (
        <StandaloneInstallPickerSheet
          initialDestinationId={activeProfile ? `profile-${activeProfile.id}` : null}
          initialVersion={sheet.version}
          key={sheet.mod.modid}
          mod={sheet.mod}
          onOpenChange={onOpenChange}
          open={open}
          prompt={sheet.prompt}
        />
      )}

      <BlockedAuthorsSheet open={blockedOpen} onOpenChange={onBlockedOpenChange} />
    </>
  );
}
