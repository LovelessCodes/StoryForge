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

- Page header:
  ```tsx
  <div className="flex items-start justify-between gap-4">
    <div>
      <h1 className="text-lg font-semibold">Title</h1>
      <p className="text-muted-foreground text-xs">Short description.</p>
    </div>
    <div className="flex items-center gap-2">{/* actions */}</div>
  </div>
  ```
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

**VS Launcher (XurxoMF) import** — reads `<appData>/VSLauncher/config.json` (VS Launcher pins
Electron's userData to that folder):

| Command                            | Args                                | Returns                    |
| ---------------------------------- | ----------------------------------- | -------------------------- |
| `detect_vs_launcher_installations` | —                                   | `VsLauncherInstallation[]` |
| `import_vs_launcher_installations` | `{ paths, mode: "move" \| "copy" }` | `{ migrated, skipped }`    |

Only paths listed in the VS Launcher config are accepted; completed imports are recorded in
`<app data>/vs-launcher-migration.json`. VS Launcher stores env vars as a comma-separated
`KEY=value` string, playtime in milliseconds (converted to seconds) and uses its own icon
artwork (icons are not carried over).

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
