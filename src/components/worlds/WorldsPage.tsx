import { Globe, Search, Upload } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useActiveProfile } from "@/hooks/use-active-profile";
import { useSaves } from "@/hooks/use-saves";
import { useAllMaps, type MapEntry } from "@/hooks/use-world-map";
import type { World } from "@/lib/types";
import type { Profile } from "@/stores/profiles";
import { useSettingsStore } from "@/stores/settings";

import ImportWorldSheet from "./ImportWorldSheet";
import MapRow from "./MapRow";
import WorldRow from "./WorldRow";
import { filterMaps, filterWorlds, standaloneMaps } from "./worlds-utils";

const ALL_PROFILES = "all";

/** Select value for a profile filter; null means every profile. */
function profileValue(profileId: number | null): string {
  return profileId === null ? ALL_PROFILES : String(profileId);
}

/** Inverse of `profileValue`, for values coming back from the Select. */
function profileFromValue(value: unknown): number | null {
  if (typeof value === "string" && value !== ALL_PROFILES) return Number(value);
  return null;
}

export default function WorldsPage() {
  const [searchText, setSearchText] = useState("");
  // `undefined` means the user has not picked a profile on this visit yet, so
  // the setting decides; `null` is an explicit "All profiles" choice.
  const [profileFilter, setProfileFilter] = useState<number | null | undefined>(undefined);
  const [importOpen, setImportOpen] = useState(false);

  const { activeProfile, profiles } = useActiveProfile();
  const defaultToActiveProfile = useSettingsStore((s) => s.defaultWorldsToActiveProfile);
  const { data: worlds, isPending } = useSaves();
  const { data: allMaps } = useAllMaps();

  const defaultProfileId = defaultToActiveProfile ? (activeProfile?.id ?? null) : null;
  const selectedProfileId = profileFilter !== undefined ? profileFilter : defaultProfileId;

  return (
    <div className="grid gap-6">
      <WorldsToolbar
        onImport={() => setImportOpen(true)}
        onProfileChange={setProfileFilter}
        onSearchChange={setSearchText}
        profiles={profiles}
        searchText={searchText}
        selectedProfileId={selectedProfileId}
      />
      <WorldsBody
        activeProfile={activeProfile}
        allMaps={allMaps ?? []}
        isPending={isPending}
        profiles={profiles}
        searchText={searchText}
        selectedProfileId={selectedProfileId}
        worlds={worlds ?? []}
      />
      <ImportWorldSheet onOpenChange={setImportOpen} open={importOpen} profiles={profiles} />
    </div>
  );
}

/** Search, profile filter and the import button. */
function WorldsToolbar({
  onImport,
  onProfileChange,
  onSearchChange,
  profiles,
  searchText,
  selectedProfileId,
}: {
  onImport: () => void;
  onProfileChange: (profileId: number | null) => void;
  onSearchChange: (text: string) => void;
  profiles: Profile[];
  searchText: string;
  selectedProfileId: number | null;
}) {
  const { t } = useTranslation();
  const profileItems = profiles.map((profile) => ({
    label: profile.name,
    value: String(profile.id),
  }));

  return (
    <div className="flex flex-wrap items-center gap-2">
      <InputGroup className="w-full sm:w-72">
        <InputGroupAddon>
          <Search />
        </InputGroupAddon>
        <InputGroupInput
          aria-label={t("worlds.page.searchAria")}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder={t("worlds.page.searchPlaceholder")}
          value={searchText}
        />
      </InputGroup>

      <Select
        items={[{ label: t("worlds.page.allProfiles"), value: ALL_PROFILES }, ...profileItems]}
        value={profileValue(selectedProfileId)}
        onValueChange={(value) => onProfileChange(profileFromValue(value))}
      >
        <SelectTrigger className="w-44" aria-label={t("worlds.page.filterAria")}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_PROFILES}>{t("worlds.page.allProfiles")}</SelectItem>
          {profileItems.map((profile) => (
            <SelectItem key={profile.value} value={profile.value}>
              {profile.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Button className="ms-auto" onClick={onImport} size="sm" variant="outline">
        <Upload /> {t("worlds.import.button")}
      </Button>
    </div>
  );
}

/** The filtered world and map lists, or the loading line. */
function WorldsBody({
  activeProfile,
  allMaps,
  isPending,
  profiles,
  searchText,
  selectedProfileId,
  worlds,
}: {
  activeProfile: Profile | null;
  allMaps: MapEntry[];
  isPending: boolean;
  profiles: Profile[];
  searchText: string;
  selectedProfileId: number | null;
  worlds: World[];
}) {
  const { t } = useTranslation();
  if (isPending) {
    return <p className="text-muted-foreground text-sm">{t("worlds.page.loading")}</p>;
  }

  const search = searchText.trim().toLowerCase();
  const maps = standaloneMaps(allMaps, worlds);

  return (
    <>
      <WorldsSection
        activeProfile={activeProfile}
        filterActive={search !== "" || selectedProfileId !== null}
        hasAnything={worlds.length > 0 || maps.length > 0}
        profiles={profiles}
        worlds={filterWorlds(worlds, profiles, search, selectedProfileId)}
      />
      <MapsSection maps={filterMaps(maps, search, selectedProfileId)} profiles={profiles} />
    </>
  );
}

/** The worlds heading, its list, and the matching empty state. */
function WorldsSection({
  activeProfile,
  filterActive,
  hasAnything,
  profiles,
  worlds,
}: {
  activeProfile: Profile | null;
  filterActive: boolean;
  hasAnything: boolean;
  profiles: Profile[];
  worlds: World[];
}) {
  const { t } = useTranslation();
  const heading =
    worlds.length > 0
      ? t("worlds.page.worldsCount", { count: worlds.length })
      : t("worlds.page.worlds");

  return (
    <section className="grid gap-2">
      <h2 className="text-muted-foreground text-[11px] font-semibold tracking-wider uppercase">
        {heading}
      </h2>
      {worlds.length === 0 ? (
        <WorldsEmpty filterActive={filterActive} hasAnything={hasAnything} />
      ) : (
        <div className="divide-y border">
          {worlds.map((world) => (
            <WorldRow
              activeProfile={activeProfile}
              key={world.path}
              profiles={profiles}
              world={world}
            />
          ))}
        </div>
      )}
    </section>
  );
}

/** Nothing installed yet versus nothing matching the filters. */
function WorldsEmpty({
  filterActive,
  hasAnything,
}: {
  filterActive: boolean;
  hasAnything: boolean;
}) {
  const { t } = useTranslation();
  if (!filterActive && !hasAnything) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 border border-dashed p-10 text-center">
        <Globe className="text-muted-foreground size-6" />
        <p className="text-muted-foreground text-xs">{t("worlds.page.empty")}</p>
      </div>
    );
  }
  return <p className="text-muted-foreground text-sm">{t("worlds.page.noMatches")}</p>;
}

/** Maps that are not attached to a world save. */
function MapsSection({ maps, profiles }: { maps: MapEntry[]; profiles: Profile[] }) {
  const { t } = useTranslation();
  if (maps.length === 0) return null;

  return (
    <section className="grid gap-2">
      <h2 className="text-muted-foreground text-[11px] font-semibold tracking-wider uppercase">
        {t("worlds.page.mapsWithoutSaves", { count: maps.length })}
      </h2>
      <div className="divide-y border">
        {maps.map((map) => (
          <MapRow
            key={map.id}
            map={map}
            profile={profiles.find((profile) => profile.id === map.profile_id)}
          />
        ))}
      </div>
    </section>
  );
}
