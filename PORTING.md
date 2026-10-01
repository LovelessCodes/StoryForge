# Porting guide (internal)

This repo is a **remake of Story Forge** (the app in `../test-app`): same feature set,
but the UI is rebuilt in the **Macheim look & feel** (`../macheim`), and the domain
concept "installation" is renamed to **"profile"**.

- **Logic source of truth**: `../test-app/src` (hooks/stores/lib are already ported here).
- **Visual source of truth**: `../macheim/src` (design system already copied here).
- **Backend**: `src-tauri/src/modules/*` — already ported/renamed and compiling.

## Ground rules

1. **Only touch your feature folder** under `src/components/<feature>/`. Do not edit
   `src/stores`, `src/hooks`, `src/lib`, `src/components/{ui,common,layout}`, routes.
   If something shared is missing, implement it locally in your folder instead.
2. **Keep the logic.** Copy the data flow from the corresponding test-app page
   (queries, mutations, invalidation, event listeners, sorting/filtering), and only
   rebuild the presentation.
3. **No new dependencies.** Use what's in `package.json` (Base UI, lucide-react,
   zod, date-fns, @tanstack/react-virtual, cmdk, insane…).
4. **No sonner.** Use `import { toast } from "@/lib/notify"` — sonner-shaped facade
   (`toast.success("…", { id, description, action: { label, onClick } })`).
   For upserting toasts use `notify(key, { type, title, description, timeout })`
   from `@/components/ui/toast`.
5. **Sharp corners** (`rounded-none`, default in ui primitives). No centered modal
   dialogs — use `Sheet` (right side) for forms/details, `DropdownMenu` for row
   actions, inline forms for creation. Deletes use an inline confirm
   (button flips to "Really delete?") or a small Sheet — never `window.confirm`.
6. **camelCase invoke args** (Tauri default). `installation_id` → `profile_id`,
   so JS uses `{ profileId }`.

## Visual vocabulary (copy these classNames)

- Page header: titles and descriptions live in the persistent top bar
  (`src/components/layout/Header.tsx`, `pageMeta` map) — the single source of truth.
  Pages render only their right-aligned action row at the top:
  ```tsx
  <div className="flex items-center justify-end gap-2">{/* actions */}</div>
  ```
  Drop the row entirely when a page has no actions.
- Primary action: `<Button variant="accent-primary">`; play/launch: `variant="amber"`;
  secondary: `variant="outline"`; icon-only: `variant="ghost" size="icon-sm"`;
  danger: `variant="destructive"`; installed state: `variant="outline-success"`.
- List rows: `flex items-center gap-3 border bg-card p-3 transition-colors hover:bg-muted/40`,
  inside `divide-y border` containers or `grid gap-2`.
- Cards: `<Card>` + `CardHeader/CardTitle/CardDescription/CardContent/CardFooter` from `@/components/ui/card`.
- Empty state:
  ```tsx
  <div className="flex flex-col items-center justify-center gap-3 border border-dashed p-10 text-center">
    <Icon className="text-muted-foreground size-6" />
    <p className="text-muted-foreground text-xs">Nothing here yet.</p>
    <Button size="sm" variant="accent-primary">
      Do the thing
    </Button>
  </div>
  ```
- Sheet form shell:
  ```tsx
  <Sheet open={open} onOpenChange={onOpenChange}>
    <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-md">
      <SheetHeader className="border-b">
        <SheetTitle>…</SheetTitle>
        <SheetDescription>…</SheetDescription>
      </SheetHeader>
      <ScrollArea scrollFade className="min-h-0 flex-1">
        <div className="grid gap-4 p-4">{/* fields */}</div>
      </ScrollArea>
      <SheetFooter className="border-t">…</SheetFooter>
    </SheetContent>
  </Sheet>
  ```
- Field:
  ```tsx
  <div className="grid gap-1.5">
    <Label htmlFor="name">Name</Label>
    <Input id="name" value={…} onChange={…} />
    {error && <p className="text-destructive text-[11px]">{error}</p>}
  </div>
  ```
- Meta text: `text-muted-foreground text-xs`; micro labels: `text-[10px] font-medium tracking-widest uppercase`;
  paths/versions: `font-mono text-xs`.
- Section rhythm: `grid gap-6`; card internals `grid gap-3`.

Reference implementations in macheim: `components/profiles/ProfileManager.tsx`,
`components/mods/{ModGrid,ModCard,ModDetail}.tsx`, `components/saves/SavesPage.tsx`,
`components/layout/SettingsPage.tsx`, `components/mods/ModToolbar.tsx`.

## Backend command changes (installation → profile)

Renamed 1:1: `get_all_profiles`, `save_profile`, `import_profile`, `remove_profile`,
`move_profiles_folder`, `remove_all_profiles`, `rename_profiles_folder`,
`get_profile_logs`, `read_profile_log`, `get_profile_saves`, `get_profile_mods`,
`add_mod_to_profile`, `remove_mod_from_profile`, `add_server_to_profile`,
`remove_server_from_profile`, `check_server_in_profile`.

`play_game` takes `{ options: { profile_id, save?, server?, password?, use_system_dotnet } }`.

**New profile-lifecycle commands** (Macheim-inspired):

| Command                   | Args                        | Returns                                                                  |
| ------------------------- | --------------------------- | ------------------------------------------------------------------------ |
| `clone_profile`           | `{ id, name }`              | `ProfileResult`                                                          |
| `rename_profile`          | `{ id, name }`              | `ProfileResult` (**id changes** — it hashes the folder name)             |
| `soft_delete_profile`     | `{ id, activeId? }`         | `DeletedProfile` (refuses the active profile and the last remaining one) |
| `list_deleted_profiles`   | —                           | `DeletedProfile[]`                                                       |
| `restore_deleted_profile` | `{ archiveName, newName? }` | `ProfileResult`                                                          |
| `purge_deleted_profile`   | `{ archiveName }`           | `()`                                                                     |
| `purge_deleted_profiles`  | —                           | number                                                                   |
| `export_profile`          | `{ id }`                    | JSON string (`ProfileExportPayload`)                                     |
| `export_profile_file`     | `{ id, path }`              | `()`                                                                     |
| `export_profile_code`     | `{ id }`                    | `SF1.<base64>` string                                                    |
| `import_profile_code`     | `{ code }`                  | JSON string (accepts raw JSON too)                                       |
| `read_profile_file`       | `{ path }`                  | JSON string                                                              |

`DeletedProfile = { archive_name, name, version, mod_count, deleted_at }`.
`ProfileExportPayload` and `OutputMod`/`Mod` types live in `src/lib/types.ts`.

**Legacy migration** (installations from the previous Story Forge release):

| Command                        | Args                                  | Returns                 |
| ------------------------------ | ------------------------------------- | ----------------------- |
| `detect_legacy_installations`  | —                                     | `LegacyInstallation[]`  |
| `migrate_legacy_installations` | `{ folders, mode: "move" \| "copy" }` | `{ migrated, skipped }` |

The legacy folder is resolved from the old app's `store/settings.json`
(`installationsParent`/`installationsSubdir`, falling back to `<app data>/installations`).
Migration converts `installation.json` → `profile.json` and records completed imports in
`<app data>/legacy-migration.json`; name collisions import under a suffixed folder
(e.g. `default-2`).

**VS Launcher / RiftLauncher (the VS Launcher family) import** — reads
`<appData>/VSLauncher/config.json` and `<appData>/RiftLauncher/config.json` (RiftLauncher is
the maintained continuation and copies VS Launcher's data over on first run, so both may
describe the same folders; the first match wins):

| Command                            | Args                                | Returns                    |
| ---------------------------------- | ----------------------------------- | -------------------------- |
| `detect_vs_launcher_installations` | —                                   | `VsLauncherInstallation[]` |
| `import_vs_launcher_installations` | `{ paths, mode: "move" \| "copy" }` | `{ migrated, skipped }`    |

Only paths listed in either config are accepted; completed imports are recorded in
`<app data>/vs-launcher-migration.json`. Both store env vars as a comma-separated
`KEY=value` string, playtime in milliseconds (converted to seconds) and use their own icon
artwork (icons are not carried over).

**MVL (scgm0) import** — reads `<Godot user dir>/MVL/data.json` (`%APPDATA%\MVL` on Windows,
`$XDG_DATA_HOME/MVL` on Linux, `~/Library/Application Support/MVL` on macOS) and the `modpack`
path list it contains:

| Command               | Args                                | Returns                 |
| --------------------- | ----------------------------------- | ----------------------- |
| `detect_mvl_modpacks` | —                                   | `MvlModpack[]`          |
| `import_mvl_modpacks` | `{ paths, mode: "move" \| "copy" }` | `{ migrated, skipped }` |

An MVL modpack folder _is_ the game data path (VSRun launches the game with the modpack as
`VintageStoryDataPath`); `modpack.json` supplies the name and game version (v1 uses
`modpackName`/`gameVersion`, v0 `name`/`version`). Imports are recorded in
`<app data>/mvl-migration.json`. MVL's `command`/`mainAssembly` (its VSRun wiring) and
`modpackIcon.*` artwork have no Story Forge equivalent and are not carried over.

**Waxlight Launcher (AmadoMuerte) import** — reads the SQLite database at
`<data root>/waxlight.db` (the fixed home `<OS config dir>/waxlight` holds only a plain-text
`data-root` pointer to the movable data root):

| Command                     | Args                                | Returns                 |
| --------------------------- | ----------------------------------- | ----------------------- |
| `detect_waxlight_instances` | —                                   | `WaxlightInstance[]`    |
| `import_waxlight_instances` | `{ paths, mode: "move" \| "copy" }` | `{ migrated, skipped }` |

Instances come from the `instances` table (directories may be data-root relative since schema
v11), the game version from `game_versions.name`, and playtime from the summed
`play_sessions.duration_sec`. Only columns that exist are selected, so older schemas still
work. Launch arguments are re-quoted so shell-word parsing round-trips them; imports are
recorded in `<app data>/waxlight-migration.json`. Covers (`cover_path`) are not carried over.

**Cairn (cairns-gg) import** — resolves the root like Cairn does (`CAIRN_HOME`, else the
`home` pointer inside the default root, else `~/.cairn`) and treats a pack as the instance:
its game data path is `<root>/packs/<id>/data` while its mods sit in
`<root>/packs/<id>/Mods`; `pack.json` supplies the name and game version:

| Command              | Args        | Returns                 |
| -------------------- | ----------- | ----------------------- |
| `detect_cairn_packs` | —           | `CairnPack[]`           |
| `import_cairn_packs` | `{ paths }` | `{ migrated, skipped }` |

Import is **copy-only** (the pack folder also holds Cairn's manifest, lock and local-state
files, so there is nothing to move without breaking Cairn): `data/` is copied into the
profile root and `Mods/` into the profile's `Mods/`. Imports are recorded in
`<app data>/cairn-migration.json`; game builds Cairn installed under `<root>/games/<version>`
can be linked in place.

**Rustory (XurxoMF) import** — reads `<appConfigDir>/xyz.rustory.app/config.json` for
`vsInstancesPath`/`vsVersionsPath` (defaults `<appDataDir>/VSInstances` and
`<appDataDir>/VSVersions`), then every instance folder with an `instance.json`:

| Command                    | Args        | Returns                 |
| -------------------------- | ----------- | ----------------------- |
| `detect_rustory_instances` | —           | `RustoryInstance[]`     |
| `import_rustory_instances` | `{ paths }` | `{ migrated, skipped }` |

Rustory (the `VS Launcher 2.0` successor by the same author) nests the game data as
`Data/` inside the instance folder next to its `instance.json` and `Backups/`, so import is
**copy-only**: `Data/` is copied into the profile root. Playtime (milliseconds → seconds),
launch parameters, env vars (comma/newline-separated `KEY=value`, `mesaGlThread` →
`MESA_GLTHREAD`) are preserved; imports are recorded in `<app data>/rustory-migration.json`.
Game builds under `vsVersionsPath` can be linked in place.

**GruntLauncher (renarin-kholin) import** — reads `config.toml` from
`ProjectDirs("com", "renarin", "gruntlauncher")` (`~/.config/gruntlauncher`,
`~/Library/Application Support/com.renarin.gruntlauncher`,
`%APPDATA%\renarin\gruntlauncher\config`) for `instances_folder`/`installations_folder`
(defaults under the platform data dir), then every `<instances_folder>/<uuid>/instance.toml`:

| Command                          | Args                                | Returns                   |
| -------------------------------- | ----------------------------------- | ------------------------- |
| `detect_gruntlauncher_instances` | —                                   | `GruntLauncherInstance[]` |
| `import_gruntlauncher_instances` | `{ paths, mode: "move" \| "copy" }` | `{ migrated, skipped }`   |

The instance folder is the game data path (mods in `Mods/`, settings in
`clientsettings.json`), so import moves or copies the whole folder; GruntLauncher's
`instance.toml` and `Logos/` cache are removed from the imported profile. Imports are
recorded in `<app data>/gruntlauncher-migration.json`. Game builds under
`<installations_folder>/<version>` and the local install paths named by instances can be
linked in place.

**Lithic (NotAShelf) import** — resolves the data root like Lithic does
(`LITHIC_DATA_DIR`, else `<platform data dir>/lithic`) and reads
`<data>/instances/<id>/instance.toml`:

| Command                   | Args        | Returns                 |
| ------------------------- | ----------- | ----------------------- |
| `detect_lithic_instances` | —           | `LithicInstance[]`      |
| `import_lithic_instances` | `{ paths }` | `{ migrated, skipped }` |

An instance's data is `<instance>/data` (or the external `data_dir` it names — often the
stock `VintagestoryData`, flagged in the UI), mods come from `mods_dir` or `<data>/Mods`, and
mods switched off live in `<instance>/disabled-mods`. Import is **copy-only** (the instance
folder also holds Lithic's settings, lock and logs): data is copied into the profile root,
an external mods folder into the profile's `Mods/`, and disabled mods into
`mods-disabled/` (kept but not loaded). Playtime, launch arguments and env vars are
preserved; wrappers (`gamemoderun`, `prime-run`) have no equivalent and are dropped. Imports
are recorded in `<app data>/lithic-migration.json`; builds registered in
`<data>/game/installs.toml` can be linked in place.

**Yelloowstone (jgwoolley/vintage-story-launcher) import** — reads the JSON array in
`~/.config/VSLauncher/config.json` (all platforms; VS Launcher's object config at the same
Linux path is skipped by both importers) with `{ name, runtimePath, dataPath }` entries:

| Command                         | Args                                | Returns                  |
| ------------------------------- | ----------------------------------- | ------------------------ |
| `detect_yelloowstone_instances` | —                                   | `YelloowstoneInstance[]` |
| `import_yelloowstone_instances` | `{ paths, mode: "move" \| "copy" }` | `{ migrated, skipped }`  |

`dataPath` is the game data folder (profile-shaped), so import moves or copies it;
`runtimePath` is a full game install whose version comes from
`assets/version-<version>.txt` (`--dataPath` is how Yelloowstone runs it). The last-open time
(`clientsettings.json` modified at) becomes the profile's playtime. Imports are recorded in
`<app data>/yelloowstone-migration.json`; runtime folders can be linked in place.

**Linked (external) game versions** — builds installed by those launchers (or any folder) are
registered in `<app data>/external-versions.json` and resolved by
`versions::resolve_version_dir` (managed versions folder first, then linked folders), so
launching and server hosting work without re-downloading. `get_installed_versions` merges them
(`path`, `external`, `source` fields) and `remove_installed_version` unlinks them instead of
deleting.

| Command                       | Args                                      | Returns               |
| ----------------------------- | ----------------------------------------- | --------------------- |
| `detect_linkable_versions`    | —                                         | `LinkableVersion[]`   |
| `link_external_versions`      | `{ versions: [{ name, path, source? }] }` | `{ linked, skipped }` |
| `unregister_external_version` | `{ name }`                                | `()`                  |

**Mod dependencies** — dependency data is not part of the ModDB API; it lives in each mod
zip's `modinfo.json` (`dependencies`, modid -> version requirement, with the special `game`
entry for the game version). `get_mod_dependencies` reads that map from an installed zip:

| Command                | Args       | Returns                |
| ---------------------- | ---------- | ---------------------- |
| `get_mod_dependencies` | `{ path }` | `{ [modid]: version }` |

After a mod download finishes, the downloads manager resolves the missing ones: the profile's
installed modids come from `get_mods`, each missing dependency is looked up through
`fetch_mod_info` (the API accepts a modid string), `lib/mod-dependencies.ts` picks the newest
release satisfying the version requirement (falling back to the newest), and the download is
queued in the same downloads sheet with the same destination. Dependency installs resolve
their own dependencies the same way when they finish; cycles terminate because installed
modids are checked before queueing.

**Servers**: `fetch_all_servers` returns an address-scoped `id` (name|ip|port hash —
favorites and status probes are stored against it) plus a profile-scoped `row_key`
(`<profile_id>:<id>`). The frontend uses `rowKey` for React keys and list/store
operations, so the same server can exist in several profiles without rows interfering.

**Existing game data adoption** (link the game's default data folder as a profile):

| Command                       | Args                      | Returns                            |
| ----------------------------- | ------------------------- | ---------------------------------- |
| `detect_default_game_data`    | —                         | `DetectedGameData[]`               |
| `adopt_game_data`             | `{ path, name, version }` | `ProfileResult` (`external: true`) |
| `unregister_external_profile` | `{ path }`                | `()`                               |

Default candidates: macOS `~/Library/Application Support/VintagestoryData` +
`~/.config/VintagestoryData`, Windows `%APPDATA%\VintagestoryData`, Linux
`$XDG_CONFIG_HOME/VintagestoryData` + the Flatpak path. Adopted folders are registered in
`<app data>/external-profiles.json`; `get_all_profiles`, the saves/maps/server scans,
`find_profile_by_id` and the managed-path checks all include them, and `Profile.external`
marks them in the UI (delete = unregister + keep the data).

## Available shared building blocks

- `ui/`: alert, badge, button, button-group, card, combobox, command, dropdown-menu,
  input, input-group, number-field, progress, scroll-area, select, separator, sheet,
  sidebar, skeleton, switch, textarea, toast, toggle, toggle-group, tooltip.
  (`Select` takes `items={[{label, value}]}` + `value`/`onValueChange`.)
- `common/`: VirtualGrid, VirtualList, ScrollToTopButton, ThemeToggle,
  LoadingSkeleton (Skeleton/CardSkeleton/ListSkeleton/GridSkeleton), route state components.
- `hooks/`: all data hooks ported under `src/hooks` (`use-installed-versions`,
  `use-download-version`, `use-download-manager`, `use-installed-mods`, `use-mod-updates`,
  `use-add-*-to-profile`, `use-saves`, `use-world-map`, `use-mod-configs`, `use-modpacks`,
  `use-play-profile`, `use-connect-to-server`, `use-public-servers`, `use-server-status`,
  `queries/server-hosting/*`, `use-active-profile`, `use-app-version`, `use-app-folder`,
  `use-reveal-in-folder`, `use-updater`…).
- `stores/`: `useProfiles`/`useProfilesStore`, `useServerStore`, `useAccountStore`,
  `useDownloadStore`, `useSettingsStore`, filter stores.

## Verification

```sh
bunx tsc --noEmit 2>&1 | grep -E '<your-file-patterns>'
bunx oxlint src/components/<feature>
```
