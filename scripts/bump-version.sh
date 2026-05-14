#!/usr/bin/env bash
set -euo pipefail

# Bump version across all config files, commit, and push tag to trigger publish.
# Usage: ./scripts/bump-version.sh <new-version>
# Example: ./scripts/bump-version.sh 0.7.0

if [ $# -ne 1 ]; then
  echo "Usage: $0 <new-version>"
  echo "Example: $0 0.7.0"
  exit 1
fi

NEW_VERSION="$1"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> Bumping version to $NEW_VERSION"

# 1. package.json
jq --arg ver "$NEW_VERSION" '.version = $ver' package.json > package.tmp.json && mv package.tmp.json package.json
echo "  package.json → $NEW_VERSION"

# 2. tauri.conf.json
TAURI_CONF="src-tauri/tauri.conf.json"
jq --arg ver "$NEW_VERSION" '.version = $ver' "$TAURI_CONF" > tauri.tmp.json && mv tauri.tmp.json "$TAURI_CONF"
echo "  $TAURI_CONF → $NEW_VERSION"

# 3. Cargo.toml
cd src-tauri
cargo set-version "$NEW_VERSION" 2>/dev/null || {
  echo "  cargo-edit not found, installing..."
  cargo install cargo-edit
  cargo set-version "$NEW_VERSION"
}
echo "  src-tauri/Cargo.toml → $NEW_VERSION"

# 4. Cargo.lock
cargo generate-lockfile 2>/dev/null || cargo update
echo "  src-tauri/Cargo.lock regenerated"

cd "$ROOT"

# 5. Format
bun run fmt 2>/dev/null || echo "  (fmt skipped — bun/biome not available)"
echo "  formatted"

# 6. Commit and push to release branch
git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml src-tauri/Cargo.lock
git commit -m "chore: bump version to $NEW_VERSION" || echo "  (nothing to commit)"
git push origin HEAD:release

# 7. Create and push tag to trigger publish
TAG="storyforge-v$NEW_VERSION"
git tag -a "$TAG" -m "Story Forge v$NEW_VERSION"
git push origin "$TAG"

echo ""
echo "==> Done! Pushed tag $TAG to trigger publish workflow."
echo "    Watch: https://github.com/$(git remote get-url origin | sed 's/.*github.com[:/]\(.*\)\.git/\1/')/actions"
