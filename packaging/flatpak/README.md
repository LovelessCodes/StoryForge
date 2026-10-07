# Flatpak / Flathub preparation

Two manifests exist:

| File                                                       | Used for                                                                                                                                                                                                                                                            |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/io.github.LovelessCodes.StoryForge.yml` (repo root)      | The Flatpak bundle attached to GitHub releases (`build_flatpak.yml`). Also fully offline: the workflow bundles `node_modules-x64.tar.gz` and passes it as a local source; Rust crates come from `cargo-sources.json`. The app source stays on the `release` branch. |
| `packaging/flatpak/io.github.LovelessCodes.StoryForge.yml` | The **Flathub-ready** variant. Same offline setup with tag-pinned, immutable sources and per-arch deps.                                                                                                                                                             |

## How offline dependencies work

- **Rust:** `cargo-sources.json` vendors every crate from `src-tauri/Cargo.lock`
  (`CARGO_HOME=/run/build/StoryForge/cargo` + the vendored-sources config emitted
  in the same file). CI fails if it drifts from `Cargo.lock`; regenerate after
  lockfile changes:
  ```sh
  uv run https://raw.githubusercontent.com/flatpak/flatpak-builder-tools/refs/heads/master/cargo/flatpak-cargo-generator.py \
    src-tauri/Cargo.lock -o packaging/flatpak/cargo-sources.json
  ```
- **Frontend:** `node_modules-{x64,arm64}.tar.gz` are attached to every GitHub
  release by `.github/workflows/flatpak-prep.yml` (runs on `release: published`,
  backfill with `workflow_dispatch` + tag). The workflow prints the sha256 of
  each bundle.
- **bun:** upstream release zip per architecture (pinned + `x-checker-data`).

## Per-release checklist

1. Release is published → the `Flatpak Prep` workflow attaches
   `node_modules-x64.tar.gz` and `node_modules-arm64.tar.gz` and prints their
   hashes (see the run log).
2. Regenerate `cargo-sources.json` if `src-tauri/Cargo.lock` changed.
3. In `io.github.LovelessCodes.StoryForge.yml`:
   - bump the `sed` version/date in the `StoryForge` module,
   - bump the three archive URLs (app tarball + both `node_modules` bundles)
     and their `sha256` values (app tarball hash: `shasum -a 256` of
     `https://github.com/LovelessCodes/StoryForge/archive/refs/tags/storyforge-v<version>.tar.gz`).
4. Future updates of the app tarball / node_modules / bun zips are proposed
   automatically on Flathub by the external-data checker via `x-checker-data`.

## Submitting (human step)

Flathub's policy prohibits AI tools or agents from opening/automating submission
pull requests or writing their messages, and the manifest itself should be
reviewed and owned by a human before submission. The technical pieces are ready
in this directory:

- Copy `io.github.LovelessCodes.StoryForge.yml`, `cargo-sources.json`, and the
  contents of `shared-modules/libayatana-appindicator/` (plus
  `shared-modules/libayatana-appindicator/libayatana-appindicator-gtk3.json`
  path layout) into a PR against `flathub/flathub`'s `new-pr` branch, titled
  `Add io.github.LovelessCodes.StoryForge`.
- CI (`Flatpak Prep` workflow) lints the manifest with `flatpak-builder-lint`
  on every change; build it locally on a Linux machine with
  `flatpak run --command=flathub-build org.flatpak.Builder --install <manifest>`
  before submitting.
- `org.freedesktop.Sdk.Extension.rust-stable` on GNOME 50 provides rustc 1.98,
  which satisfies the app's `rust-version = 1.85`.

Open review questions to be ready for: `--device=all` justification (gamepad /
game processes), `--filesystem=xdg-documents` justification (world/save import),
and the node_modules-bundle approach for bun (there is no
`flatpak-node-generator` support for bun yet — mention the bundle hashes are
pinned and the upstream tooling gap).
