# Changelog

<!-- markdownlint-disable MD024 -->
<!-- KeepAChangelog Format: Added -> Fixed -> Changed -> Removed -->

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Copying mods between profiles**: the Installed view's **Copy to profile** button copies every installed mod to another profile, and selecting rows shows the same action for just those mods. The sheet lists what will be copied, warns when the destination runs a different game version, and notes that an installed version is replaced when it differs. Files are copied locally — nothing is re-downloaded — and copied mods keep their enabled/disabled state.
- **Blocking mod authors**: the mod browser can hide every listing from an author you would rather not see. Right-click a mod row to block its author — a toast offers to undo — and the **Blocked authors** button beside the favourites toggle opens the list, where authors can be added by name, unblocked one by one, or cleared entirely. The toolbar also counts the results being hidden, so an emptied list is not mistaken for a search miss, and blocked authors no longer appear in the author filter's suggestions. Blocking is browse-only: installed mods are untouched.

### Fixed

- **Optimum installs on 0.3.20**: every install failed with "The patch conflicted with files in the game folder" because 0.3.20's API patcher looks for `cairo-sharp.dll` beside its vanilla backup instead of the game's `Lib` folder ([StratumServer/Optimum#140](https://github.com/StratumServer/Optimum/issues/140)). The game's copy is now placed where the patcher looks, and the CLI's own failure message is written to the log instead of only its reason token, so a future failure can be diagnosed from a support report.

### Changed

- **Smaller downloads**: the release build now optimizes the app crate for size while dependency optimization stays as before, shrinking the app binary and installers.
- **The Story Forge API moved to `api.getstoryforge.app`**: sign-in, modpack publishing and game version downloads now use `https://api.getstoryforge.app` instead of `https://vsapi.betterjs.dev`. The old `vsapi.betterjs.dev` domain is decommissioned in 14 days, on 2026-10-30; older builds that still point at it will stop working then.
- **Much smaller AppImage**: the unused GStreamer media framework is no longer bundled into the AppImage, cutting a large chunk off the download.

## [2.0.8] - 2026-10-15

### Fixed

- **Importing installations from the previous Story Forge no longer looks stuck**: the sheet gave no sign of life while a whole installation was copied, so a multi-gigabyte folder on a slow disk read as a hang, and the only way out was killing the app. Every folder now reports its progress: its name, its position in the run, and a bar once its size is known. Cancelling the import stops the copy within a few megabytes and removes the partial folder, and the import records each finished folder immediately, so a killed or cancelled run can be retried without importing what is already there. The app sweeps staging folders left behind by an interrupted import at startup.
- **Launcher imports get the same progress and cancel**: importing instances, installations or modpacks from Yelloowstone, Waxlight, VS Launcher / RiftLauncher, MVL and GruntLauncher now names the folder being copied, shows a progress bar, and can be cancelled. Cancelling removes the partial folder, and each finished item is recorded immediately, so a cancelled or killed import only has to import the rest.

## [2.0.7] - 2026-10-15

### Added

- **Account sessions are checked before a launch**: a selected account's stored session is validated against the auth server right before the game starts. Only a definite "expired" verdict keeps it out of `clientsettings.json` and warns in the launch toast; a check that could not run (offline, or an auth error) leaves the session unverified and usable — the same policy as the launcher-login import. With no account selected, one is adopted from the session the game itself stored — the selected default (game-defaults) profile first, then the profile being launched — and saved, so it appears in the account menu and later launches validate it.
- **Pre-release game versions**: a **Show pre-release versions** setting in Settings → Behaviour adds release candidates to the game version pickers, and the newest build then becomes the default pick. A version a profile is already pinned to stays selectable in the profile dialog even while the setting is off.

### Fixed

- **Profile renames now take their data with them**: profile ids derive from the folder name, so a rename used to leave everything keyed to the old id behind. Backups move with the profile — merging into whatever the target name already holds, with clashing names suffixed — the shared-game-defaults source id is remapped so the defaults keep applying, path-keyed records (mod pins, presets, groups) move to the new folder, and stale mod-config and backup caches are dropped while the world list is refreshed. Renaming a profile whose game is running is refused.
- **Stale mod scans after deleting or renaming a profile**: mod and update scans are cached per profile folder with `staleTime: Infinity`, so a deleted or renamed profile kept serving its old scan — including to a new profile that later reuses the folder. The cache is now dropped on delete, on rename, and when an external profile's folder is unregistered.
- **Verifying an expired session**: the verify flow looked for `invalid_session` in the error message, but the reason travels in the error's name, so an expired session showed a generic verify failure and kept the dead account. It now reports "session expired" and removes the account.
- **Read-only `clientsettings.json` no longer aborts a launch**: the file is made writable before the rewrite and kept readable afterwards, so a read-only copy is updated instead of failing the launch.

## [2.0.6] - 2026-10-15

### Added

- **Installing from the ModDB**: the mod database's **1-click install** button (`vintagestorymodinstall://<modid>@<release>`) now opens the install sheet for that exact release instead of doing nothing. The scheme is claimed by the installer on Windows and macOS, shipped in the Flatpak's desktop file, and registered at runtime on Linux and debug Windows builds when no other app already handles it. `storyforge://install?mod=<id>&version=<release>` pins a release the same way, and a release that has since disappeared is reported before the latest one is preselected.
- **Always ask where to install**: a Behaviour setting that opens the destination picker for 1-click and deep-link installs — active profile preselected, hosted servers included — instead of installing straight into the active profile. Off by default.
- **Reordering mod groups**: each group header on the Installed page carries a grip handle. Drag it to move the group — a compact ghost header follows the cursor while the source dims — or use the keyboard: space to pick up, the arrow keys to move, space to drop, escape to cancel. The order is stored per profile with the groups, also drives the "Move to group" menus, and every move is announced to screen readers.

## [2.0.5] - 2026-10-14

### Added

- **Interface text size**: Settings → Appearance has a text-size preference (80–150%) that scales the document root, so every rem-based size — text, controls and icons — follows it. The saved value is applied before the first paint, the dropdown previews the change live, and the Monaco config editor scales its font with it.

### Fixed

- **Version downloads on Windows**: Windows archives carry an explicit entry for the `app/` folder itself. Stripping the `app/` prefix left an empty path, which the traversal guard rejected, so a finished download aborted with `path error: Path must not be empty` (a regression of the 2.0.0 extraction hardening). The entry now resolves to the extraction folder, mirroring the tar path, and the game still lands at `<version>/Vintagestory.exe`.

## [2.0.4] - 2026-10-13

### Fixed

- **Connecting to a server from the dashboard**: the dashboard sent only the host into the connect flow, so the game fell back to the default port and a second, portless entry was written to the profile's saved servers (a regression of the 0.1.8 dashboard fix). The dashboard now shows, launches and stores servers as `host:port` through the same helper every other screen uses.

## [2.0.3] - 2026-10-12

### Added

- **VulkanStory installs**: install the [VulkanStory](https://github.com/KillerPixelCrew/VulkanStory)
  renderer fork for an installed version in one click. The release package is downloaded from
  VulkanStory's releases and verified against its SHA-256 archive hash; the launcher reads the file
  inventory embedded in the package straight from the remote archive over HTTP range requests, so
  unsupported game versions are refused before anything is downloaded, and every extracted file is
  verified afterwards. The package goes into a copy (`1.22.7+vulkanstory`), the original stays
  vanilla, updates are offered when a newer release still supports the game version, and an edited
  `VulkanStory/loader.ini` survives them. Windows (x64) only: VulkanStory publishes no macOS
  package, and its Linux package is not part of a release yet.

### Fixed

- **Moving mods into groups**: the "Move to group" menu on a mod row and on a multi-mod selection crashed the Mods page with Base UI error #31 instead of opening.
- **Built-in mods reported as missing**: mods that depend on `survival`, `creative` or `essentials` no longer show them as missing dependencies; they ship with the game, whatever version is required.
- **Error toasts show the real message**: actions that failed across mods, profiles, downloads, server hosting, the updater and the folder shortcuts rendered `[object Object]` instead of the backend's message, because Tauri rejects with a structured error object. They now show the actual text.
- **Open Folder on Linux**: revealing a folder goes through the XDG desktop portal, which also works inside the Flatpak sandbox where the file-manager D-Bus call is blocked. `xdg-open` remains the fallback, failures are written to the journal, and macOS and Windows are unchanged.
- **Sidebar scroll fade**: the navigation menu is now a proper scroll area with edge fades, matching the rest of the app.
- **Server status probes**: only the server's own status messages are inspected, and markers must match whole words, so a server named "Bandits" or an MOTD mentioning a "full moon" no longer reports banned/full status. Changing a server's address, port or password invalidates its cached probe result.
- **Profile deletion**: a profile whose game is running can no longer be deleted, and a failed undo-delete reports the error instead of silently doing nothing.
- **Profile name collisions**: creating or importing a profile — including installing a modpack — over a folder that already holds a profile is refused with a "path exists" message instead of overwriting it. Imported folder names that are not a plain name (e.g. `..` or separators) are rejected.
- **Mod settings safety**: enabling or disabling a mod no longer overwrites `clientsettings.json` when the file cannot be parsed (the running game may rewrite it mid-read), which previously dropped keybinds, video settings and the stored account session.
- **Account handling**: the accounts file is written atomically, failed saves surface as an error toast, launcher-login imports refuse to overwrite a corrupt accounts file, and removing the selected account selects a remaining one.
- **Server hosting**: app shutdown waits for running servers to stop, a double start can no longer spawn two instances, renaming a server keeps its instance directory in sync, and deleting a server is refused when its data directory points at the app's profiles or versions folders.
- **Map viewer**: a world whose map database contains no tiles now reports that there is nothing to show instead of plotting nonsensical bounds.
- **Download cleanup**: cancelling a download reports cleanup failures instead of silently leaving a partial file, and mod downloads are keyed by their destination folder like dependency downloads already were, so the same file never gets two entries in the downloads sheet.
- **Pack locks**: the installed-mods list refreshes after applying a pack lock (Sync / repair).
- **Archive and path hardening**: version downloads reject tar entries that would escape the extraction folder, profile and version move/remove validate the joined subdirectory, mod dependency reads stay inside managed folders, and map databases open correctly when their path contains URI characters.

### Changed

- **Type checks** run through `tsc-rs`, a drop-in Rust port of the TypeScript 7 compiler, in the build and in CI — same diagnostics, roughly twice as fast.

### Removed

- Unused frontend components, hooks and types, and backend commands left orphaned by earlier refactors.

## [2.0.2] - 2026-10-08

### Added

- **Import sessions from your profiles**: the logins import sheet now offers the game session stored in any signed-in Story Forge profile (and adopted external game folders), so an account can be added without entering a password or a two-factor code. Imported sessions are verified with the auth server first; expired ones are skipped and reported.

### Fixed

- **Sign-in for two-factor accounts**: the authenticator-code prompt now appears when Vintage Story asks for a TOTP code. The challenge response used the newer API shape (`message`/`name`), which the parser missed, and the follow-up error was rendered as `[object Object]`. Backend error messages across the app now display their actual text instead of `[object Object]`.

## [2.0.1] - 2026-10-07

### Added

- **Import installations from any folder**: the previous Story Forge could keep its installations in a custom location; the Profiles page can now be pointed at that folder directly — imports work exactly like the automatically detected ones.
- **Nix**: the app builds and runs with `nix build` / `nix run github:LovelessCodes/StoryForge` on Linux (x86_64, aarch64) and Apple Silicon macOS.

### Changed

- **Linux Flatpak**: the bundle now builds against the GNOME 51 runtime with fully offline, reproducible dependencies (no network access during the build).

### Fixed

- **Dashboard translations**: the profile and server sections of the dashboard rendered raw translation keys in every language, and the "Connect" button had no string at all. Both are fixed, and the i18n check now verifies that every referenced key exists in the catalog.

## [2.0.0] - 2026-10-07

- **Linux & NVidia Rendering Fixes**: Added logic to disable the DMA Buffer by default, which has been known to cause issues with the front-end on Linux systems with NVIDIA cards running under the Wayland compositor. This sets the `WEBKIT_DISABLE_DMABUF_RENDERER` environment variable to `1`, by default. It can be overridden by running the application with the environment variable defined as follows: `WEBKIT_DISABLE_DMABUF_RENDERER=0`.

### Added

- **Optimum client installs**: install the [Optimum](https://github.com/StratumServer/Optimum) performance fork for an installed version in one click. The official overlay is downloaded from Optimum's releases, every file is verified against its SHA-256 manifest, and the patch runs on a copy of the version (`1.22.7+optimum`), leaving the original vanilla. Updates are offered when a newer overlay still supports the game version.
- **Deep links**: `storyforge://install?mod=<id>` opens a mod in the app and `storyforge://install?pack=<slug>` opens a cloud modpack's detail sheet, so links shared outside the app land on the right install flow.
- **Pack locks**: a profile can pin its mods to exact versions and SHA-256 hashes (`storyforge.lock.json`), show drift at a glance, and run an explicit Sync / repair. Exports, share codes and structured cloud modpacks carry the lock; imports enforce it immediately.
- **Mod lifecycle**: enable/disable mods without removing them, named presets, groups/folders in the new Installed view, multi-select batch actions, install from a local `.zip` or a direct URL, update checks scoped to the profile's game version with per-release skipping, a bulk update changelog sheet, and conflict detection for overlapping assets and patch targets.
- **Launcher migration**: one-click imports from VS Launcher, RiftLauncher, Rustory, GruntLauncher, Lithic, Yelloowstone, Waxlight, MVL and Cairn, plus saved-account imports from MVL and legacy VS Launcher/RiftLauncher configs.
- **Localization**: English, German, French, Spanish, Brazilian Portuguese, Russian and Simplified Chinese.

### Changed

- **Interface rebuilt** in the Macheim design system; the domain concept "installation" is renamed to "profile" throughout.
- **Mods page** split into a Browse view (ModDB) and an Installed view (local mods, groups, batch actions).

### Fixed

- **Store-file migrations**: installations and accounts written by older releases in the persisted stores are migrated to their file-based forms at startup, so the legacy import and account loading pick them up.

## [0.9.3] - 2026-06-02

### Added

- **Playtime Tracking**: Added `last_played` and `total_time_played` fields to installations with persistence to `installation.json`. Tracks session duration and updates playtime on game exit via `game-quit` events.
- **Installation Import**: New `import_installation` Tauri command that creates installations from a comma-separated mod string (`modid@version,modid@version,…`), downloads mods with progress tracking, and returns installation details and download results.
- **Mod Download Command**: New `download_mod` Tauri command to fetch mods from the Vintage Story API, match the requested version, and download the mod file to an installation's Mods directory.
- **Import Progress UI**: Added a progress bar and per-mod status text to the import installation dialog, with error handling and event listener cleanup on completion.
- **macOS ARM64-Native dotnet Support**: ARM64 runtime detection via Mach-O header inspection on macOS aarch64. System dotnet discovery now identifies ARM64-native dotnet 10 runtimes and skips x64-only installs. Added architecture-specific download URLs and version-specific runtime selection.
- **macOS ARM64 Downloads**: Platform-specific download links for macOS ARM64 when running on aarch64 and Tauri version is at least 1.22.3.
- **Semantic Version Comparison**: Added `semver` crate dependency and `is_at_least_1_22_3` utility for comparing Tauri version strings.
- **Type-Aware Linting**: Enabled `typeAware` option in oxlint configuration and added `oxlint-tsgolint` dependency for improved TypeScript linting.

### Changed

- **Import Dialog Refactor**: Rewrote `ImportInstallationDialog` to use the new single-step `import_installation` backend command with progress tracking, replacing the old multi-step install flow. Removed dependency on `useAddModToInstallation` and `useAppFolder`.
- **Mod Schema Simplification**: The installation schema now accepts mods as either an array of mod objects or a comma-separated string (`modid@version,…`). Installation data serialization uses the comma-separated format instead of JSON arrays.
- **Error Messages**: Updated mod removal error toasts in `ModItem` and `UpdateModDialog` to use `modpath` instead of `name` for consistency.

### Fixed

- **Unhandled Promises**: Added `void` to `form.handleSubmit()` calls in `AddInstallationDialog` to satisfy type-aware linting.
- **Playtime Persistence**: `save_installation` now preserves existing `last_played` and `total_time_played` values when updating an installation, preventing playtime data loss on edits.

## [0.9.2] - 2026-06-01

### Changed

- Enabled window decorations and set transparency for the main window.

## [0.9.1] - 2026-06-01

### Added

- **Bun & Vite Types**: Added `@types/bun` dependency and bun/vite types to tsconfig for improved type checking.
- **Installation Name Labels**: Added installation name labels to the mod list for easier identification.
- **Favorites**: Added a favorite flag to installations with toggle persistence, allowing users to mark and filter favorite installations.
- **Sidebar Navigation**: Added mod configs and mods buttons to the app sidebar for quicker navigation.
- **App Logging**: Added a `log_message` Tauri command with a `logToFile` helper on the frontend. Logging now covers installation folder renames/operations, folder changes in settings, parent directory operations, and versions folder operations.
- **UI Enhancements**: Added a truncate class to sidebar buttons and a `size` prop to the UpdateAllButton.
- **Query Staleness**: Added `staleTime` configuration to React Query queries.

### Changed

- **Mod List Performance**: Optimized mod list filtering and sorting for better performance.
- **Animation Scope**: Moved `AnimatePresence` to wrap `ScrollArea` for smoother list animations.
- **Tab Styling**: Added border and shadow to the tabs list for visual clarity.
- **Search Input**: Constrained search input width to fit its content.
- **Refactor**: Renamed `parentRef` to `scrollRef` and updated related prop names for clarity.

### Fixed

- **Docs**: Fixed macOS notarization instructions and removed a redundant markdown separator.

## [0.8.0] - 2026-03-18

### Added

- **Base UI Migration**: Replaced Radix UI with Base UI across all components. Introduced new component primitives: Accordion, Alert, AlertDialog, Autocomplete, Avatar, Badge, Breadcrumb, Button, Calendar, Checkbox, CheckboxGroup, Collapsible, Combobox, CommandDialog, ContextMenu, Dialog, Drawer, Empty, Field, Fieldset, Form, Frame, Group, Input, InputGroup, Kbd, Label, Menu, Meter, NumberField, OTPField, Pagination, Popover, PreviewCard, Progress, RadioGroup, ScrollArea, Select, Separator, Sheet, Skeleton, Slider, Spinner, Switch, Table, Tabs, Textarea, Toast/Toaster, Toggle, ToggleGroup, Toolbar, and Tooltip.
- **UI Revamp**: Refactored all dialogs to use unified root dialog handles, replacing the Zustand-based `useDialogStore`. Consolidated tooltip implementation and improved styling, accessibility, and `"use client"` directives across all components.
- **Better Logging**: Added a logger module using the `log` crate with logging macros (`log_error!`, `log_info!`, etc.). Replaced all `eprintln!` calls with proper logging. Added `get_logs` command and a log viewer to the settings page.
- **Individual Installation Logs**: Added per-installation log files, a `ViewLogsDialog` component, and a "View Logs" button to installation rows.
- **Account Persistence**: Added save and load functionality for user accounts. Automatically removes user on auth verification failure.
- **Server Sniffer**: Added a server sniffer module with a default port of 42420.
- **Server Maps**: Added standalone map viewing support.
- **Cancel Download**: Added cancellation support for downloads and extractions.
- **Update All Mods**: Added a batch "Update All" button for mod updates with loading toast.
- **Responsive Design**: Added `useMediaQuery` hook for responsive design support.
- **InputGroup & InputGroupAddon**: New input group component with addon, text, input, and textarea variants.
- **Version Matching**: Compare major and minor version numbers instead of full version strings for server version matching.

### Fixed

- **Instant Dark Mode**: Fixed `toggleDarkMode` to manage body class for instant theme switching.
- **Installation Renaming**: Fixed issue where renaming an installation would create an empty folder.
- **Blank Screen on Linux**: Fixed AppImage blank screen issue on some Linux distros by updating Ubuntu package dependencies.
- **Map Color Grading**: Fixed pixel color decoding in `pixels_to_png` for maps.
- **Map Icons**: Fixed map icons path for correct build resolution.

### Changed

- Replaced `useDialogStore` (Zustand-based) with unified root dialog handles across all dialogs.
- Replaced `@radix-ui` dependencies with Base UI throughout the UI stack.
- Updated colour scheme and typography across the application.
- Dashboard layout restructured with a grid layout.
- Settings page layout and spacing adjusted.
- Replaced bash version bump script with a TypeScript version.

### Removed

- Removed the Zustand-based `useDialogStore` and related types.
- Removed `@radix-ui` package dependencies.

## [0.5.4] - 2025-10-31

### Fixed

- Resolve an issue with our build steps that would introduce blank screen on some linux distros using AppImage.

## [0.5.3] - 2025-10-29

### Added

- Introduced a "Cancel" button for version downloads.

### Fixed

- Resolve an issue where dark mode was not being enabled/disabled instantly, when switching.
- Resolve an issue where it would just create an empty folder, when renaming an installation.

## [0.5.2] - 2025-10-28

### Fixed

- Resolve an issue where users no longer can add servers or installations due to index errors.

## [0.5.1] - 2025-10-26

### Added

- Introduced "Update All" button on the mods page, under the installed mods.

### Fixed

- Resolve a coloring issue with the maps being displayed on the world maps.
- Resolve an issue that made map icons not appear correctly.

## [0.5.0] - 2025-10-21

### Added

- Introduced a map viewer on worlds, complete with map markers and prospect readings.
- Added a Context menu to all components that are interactable.

### Changed

- Cleaned up code handling paths to make the application more robust.
- Sorting algorithm for installations, to make the sorting consistent across pages.

### Fixed

- Resolve an issue with mod updating, where it wouldn't instantly show you if an update is available.

### Removed

- Drag and drop functionality for servers and installations.

## [0.4.2] - 2025-10-10

### Fixed

- Resolve an issue where mods were linking to the Mod site homepage.
- Resolve an issue where some mods were shown as installed, even when they weren't installed.

## [0.4.1] - 2025-10-10

### Fixed

- Resolve an issue where modPaths don't get updated accordingly when clientsettings.json gets imported.
- Resolves an issue where installation absolute paths don't get updated accordingly.

## [0.4.0] - 2025-10-09

### Added

- Changelog in KeepAChangelog format.
- Biome formatting to the "Bump version" workflow.
- Better version selection process on installations.
- Feedback on connecting to a server.
- [Code of conduct](/CODE_OF_CONDUCT.md) adapted from [Contributor Covenant](https://www.contributor-covenant.org/).
- [Contributing document](./CONTRIBUTING.md) to help new contributors.
- "Any" side filtering on mods page.
- Labels added to selects/dropdowns on mods page.
- Ability to change theme.
- Ability to enable stream mode to hide server ip addresses.
- Ability to change where versions and installation folders are stored.

### Fixed

- Resolved warnings during the build process.
- Resolve db-wal and db-shm issue on world rename.
- Resolved Tar issue on some Linux distros
- Fixed an issue where the game would not load a world if done through the launcher on windows.
- Fixed issue on windows with _some_ paths on installations and versions.
- Fixed an issue where the documents folder would be opened instead of the installation folder on windows.
- Fixed an issue where, after deleting a version, reinstalling the same version would throw an error.

### Changed

- Extended README by required software.
- Pull request template to be enforced.
- Code quality workflow to only run when certain files have changed.

## [0.3.6] - 2025-10-05

### Added

- Support for parsing mod configuration files using json5.

### Changed

- Added an "Update" button for mods to fetch and apply the latest version.
- Improved mod installation workflow and UX.

## [0.3.5] - 2025-10-04

### Fixed

- Fixed a crash when looking up mod updates.

## [0.3.4] - 2025-10-04

### Changed

- UI revamp with animations across the application.
- Animated mod and server lists and dashboard improvements.
- Download/cancel feedback improvements for update operations.

## [0.3.3] - 2025-10-03

### Added

- World map enhancements.
- Keyboard shortcut for global search.

### Changed

- Animated UI for installations, versions, servers, and worlds.
- Game launch feedback improvements.

## [0.3.1] - 2025-10-02

### Fixed

- Fixed rusqlite dependency feature flags.

### Changed

- Enabled WebKit compositing on Linux.

## [0.3.0] - 2025-10-02

### Added

- Improved mod configuration editor.
- World editing and deletion features.

### Changed

- New Tauri bundler configuration.
- Dashboard layout tweaks.

## [0.2.9] - 2025-09-27

### Added

- Server management pipeline and related features.

### Changed

- Capability updates for opener permission.
- Release automation improvements for version bumps.

### Removed

- Removed unused plugins and dependencies.

## [0.1.8] - 2025-09-23

### Fixed

- Fixed connecting to servers from the dashboard (port was not used).

## [0.1.7] - 2025-09-23

### Added

- Worlds page with play functionality.
- Discord invite button in the sidebar.

### Changed

- Theme now follows the operating system preference.

## [0.1.6] - 2025-09-18

### Changed

- Mod configuration editing UI.

## [0.1.5] - 2025-09-17

### Changed

- Refactored dialogs across the app.

### Removed

- Added delete button for version items (UI change noted under Changed).

## [0.1.4] - 2025-09-17

### Changed

- Updater endpoint configuration adjustments.
- Re-ran release for an older updater (dual tags handling).

## [0.1.3] - 2025-09-16

### Changed

- Latest tag workflow improvements.

## [0.1.2] - 2025-09-16

### Fixed

- Updater endpoint bug fix.

### Changed

- README documentation enhancements.

## [0.1.1] - 2025-09-16

### Added

- Initial updater capabilities.

### Fixed

- Stabilized login dialog and authentication flow.

<!-- Version links for diff and release pages -->

[0.9.3]: https://github.com/LovelessCodes/StoryForge/releases/tag/storyforge-v0.9.3
[0.9.2]: https://github.com/LovelessCodes/StoryForge/releases/tag/storyforge-v0.9.2
[0.9.1]: https://github.com/LovelessCodes/StoryForge/releases/tag/storyforge-v0.9.1
[0.8.0]: https://github.com/LovelessCodes/StoryForge/releases/tag/storyforge-v0.8.0
[0.5.4]: https://github.com/LovelessCodes/StoryForge/releases/tag/storyforge-v0.5.4
[0.5.3]: https://github.com/LovelessCodes/StoryForge/releases/tag/storyforge-v0.5.3
[0.5.2]: https://github.com/LovelessCodes/StoryForge/releases/tag/storyforge-v0.5.2
[0.5.1]: https://github.com/LovelessCodes/StoryForge/releases/tag/storyforge-v0.5.1
[0.5.0]: https://github.com/LovelessCodes/StoryForge/releases/tag/storyforge-v0.5.0
[0.4.2]: https://github.com/LovelessCodes/StoryForge/releases/tag/storyforge-v0.4.2
[0.4.1]: https://github.com/LovelessCodes/StoryForge/releases/tag/storyforge-v0.4.1
[0.4.0]: https://github.com/LovelessCodes/StoryForge/releases/tag/storyforge-v0.4.0
[0.3.6]: https://github.com/LovelessCodes/StoryForge/releases/tag/storyforge-v0.3.6
[0.3.5]: https://github.com/LovelessCodes/StoryForge/releases/tag/storyforge-v0.3.5
[0.3.4]: https://github.com/LovelessCodes/StoryForge/releases/tag/storyforge-v0.3.4
[0.3.3]: https://github.com/LovelessCodes/StoryForge/releases/tag/storyforge-v0.3.3
[0.3.1]: https://github.com/LovelessCodes/StoryForge/releases/tag/storyforge-v0.3.1
[0.3.0]: https://github.com/LovelessCodes/StoryForge/releases/tag/storyforge-v0.3.0
[0.2.9]: https://github.com/LovelessCodes/StoryForge/releases/tag/storyforge-v0.2.9
[0.1.8]: https://github.com/LovelessCodes/StoryForge/releases/tag/storyforge-v0.1.8
[0.1.7]: https://github.com/LovelessCodes/StoryForge/releases/tag/storyforge-v0.1.7
[0.1.6]: https://github.com/LovelessCodes/StoryForge/releases/tag/storyforge-v0.1.6
[0.1.5]: https://github.com/LovelessCodes/StoryForge/releases/tag/storyforge-v0.1.5
[0.1.4]: https://github.com/LovelessCodes/StoryForge/releases/tag/storyforge-v0.1.4
[0.1.3]: https://github.com/LovelessCodes/StoryForge/releases/tag/storyforge-v0.1.3
[0.1.2]: https://github.com/LovelessCodes/StoryForge/releases/tag/storyforge-v0.1.2
[0.1.1]: https://github.com/LovelessCodes/StoryForge/releases/tag/storyforge-v0.1.1
