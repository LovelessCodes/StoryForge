# Changelog

<!-- markdownlint-disable MD024 -->
<!-- KeepAChangelog Format: Added -> Fixed -> Changed -> Removed -->

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

- **Linux & NVidia Rendering Fixes**: Added logic to disable the DMA Buffer by default, which has been known to cause issues with the front-end on Linux systems with NVIDIA cards running under the Wayland compositor. This sets the `WEBKIT_DISABLE_DMABUF_RENDERER` environment variable to `1`, by default. It can be overridden by running the application with the environment variable defined as follows: `WEBKIT_DISABLE_DMABUF_RENDERER=0`.

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
