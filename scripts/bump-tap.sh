#!/usr/bin/env bash
# Bump Tokscale formula or cask in the akhil-gautam/homebrew-tap repo.
#
# Usage:
#   ./scripts/bump-tap.sh cli <version>     # after CLI npm publish
#   ./scripts/bump-tap.sh mac <version>     # after Mac app GitHub release
#
# Requires: git, curl, shasum, gh (logged in), and push access to
# akhil-gautam/homebrew-tap.
set -euo pipefail

TAP_REPO="akhil-gautam/homebrew-tap"
TAP_DIR="${TAP_DIR:-$(mktemp -d)/homebrew-tap}"
KIND="${1:?usage: bump-tap.sh <cli|mac> <version>}"
VERSION="${2:?usage: bump-tap.sh <cli|mac> <version>}"

echo ">> clone $TAP_REPO into $TAP_DIR"
rm -rf "$TAP_DIR"
gh repo clone "$TAP_REPO" "$TAP_DIR" >/dev/null

cd "$TAP_DIR"

case "$KIND" in
  cli)
    TARBALL_URL="https://registry.npmjs.org/toktracker/-/toktracker-${VERSION}.tgz"
    echo ">> fetching $TARBALL_URL"
    TMP_TGZ="$(mktemp)"
    curl -fsSL "$TARBALL_URL" -o "$TMP_TGZ"
    SHA256=$(shasum -a 256 "$TMP_TGZ" | awk '{print $1}')
    rm -f "$TMP_TGZ"
    FILE="Formula/toktracker.rb"
    /usr/bin/sed -i '' -E \
      -e "s|url \"https://registry.npmjs.org/toktracker/-/toktracker-[^\"]+\"|url \"$TARBALL_URL\"|" \
      -e "s|sha256 \"[0-9a-f]{64}\"|sha256 \"$SHA256\"|" \
      "$FILE"
    ;;
  mac)
    ZIP_URL="https://github.com/akhil-gautam/toktracker/releases/download/mac-v${VERSION}/Tokscale-${VERSION}.zip"
    echo ">> fetching $ZIP_URL"
    TMP_ZIP="$(mktemp)"
    curl -fsSL "$ZIP_URL" -o "$TMP_ZIP"
    SHA256=$(shasum -a 256 "$TMP_ZIP" | awk '{print $1}')
    rm -f "$TMP_ZIP"
    FILE="Casks/toktracker.rb"
    /usr/bin/sed -i '' -E \
      -e "s|version \"[^\"]+\"|version \"$VERSION\"|" \
      -e "s|sha256 \"[0-9a-f]{64}\"|sha256 \"$SHA256\"|" \
      "$FILE"
    ;;
  *)
    echo "unknown kind: $KIND (expected cli or mac)" >&2
    exit 2 ;;
esac

echo ">> diff:"
git --no-pager diff --stat
git --no-pager diff

echo ">> commit + push"
git add "$FILE"
git commit -m "chore: bump $KIND tokscale to $VERSION"
git push origin HEAD

echo ">> done: tap updated for $KIND $VERSION ($SHA256)"
