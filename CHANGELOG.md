
# Changelog

<!-- markdownlint-disable MD024 -->
<!-- KeepAChangelog Format: Added -> Fixed -> Changed -> Removed -->

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
