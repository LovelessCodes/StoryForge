import { Link } from "@tanstack/react-router";
import { Check, ChevronsUpDown, IdCard, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { notify } from "@/components/ui/toast";
import { useActiveProfile } from "@/hooks/use-active-profile";

/**
 * Sidebar profile switcher. Switching only changes which profile the UI
 * targets (profiles are isolated data directories, nothing is swapped on
 * disk), so it is always safe.
 */
export default function ProfileSelector() {
  const { activeProfile, profiles, setActiveProfileId } = useActiveProfile();

  function select(id: number) {
    if (activeProfile?.id === id) return;
    setActiveProfileId(id);
    const profile = profiles.find((p) => p.id === id);
    if (profile) {
      notify("active-profile", {
        type: "success",
        title: `Switched to "${profile.name}"`,
        timeout: 2500,
      });
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="outline" className="group/trigger w-full justify-between font-normal" />
        }
      >
        <span className="flex min-w-0 items-center gap-2">
          <IdCard className="text-muted-foreground size-4 shrink-0" />
          <span className="truncate">{activeProfile?.name ?? "No profile"}</span>
        </span>
        <ChevronsUpDown className="text-muted-foreground size-4 shrink-0" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Profiles</DropdownMenuLabel>
          {profiles.length === 0 && <DropdownMenuItem disabled>No profiles yet</DropdownMenuItem>}
          {profiles.map((profile) => (
            <DropdownMenuItem key={profile.id} onClick={() => select(profile.id)}>
              <span className="min-w-0 flex-1">
                <span className="block truncate">{profile.name}</span>
                <span className="text-muted-foreground block text-[10px]">v{profile.version}</span>
              </span>
              {activeProfile?.id === profile.id && <Check className="size-3.5 shrink-0" />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link to="/profiles" />}>
          <Plus />
          Manage profiles
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
