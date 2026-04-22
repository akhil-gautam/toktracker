#!/usr/bin/env bash
# Build Tokscale.app bundle from SwiftPM executables.
#
# Produces:  build/Tokscale.app
# Contains:  Contents/MacOS/Tokscale
#            Contents/MacOS/tokscale-hook
#            Contents/Info.plist
#            Contents/Resources/<resource bundles copied from .build>
#
# Usage:  ./scripts/build-app.sh [release|debug]
set -euo pipefail

CONFIG="${1:-release}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP_DIR="$ROOT/build/Tokscale.app"
CONTENTS="$APP_DIR/Contents"

SWIFT_FLAGS=(-Xswiftc -strict-concurrency=minimal)

echo ">> swift build -c $CONFIG (Tokscale)"
(cd "$ROOT" && swift build -c "$CONFIG" --product Tokscale "${SWIFT_FLAGS[@]}")
echo ">> swift build -c $CONFIG (TokscaleHook)"
(cd "$ROOT" && swift build -c "$CONFIG" --product TokscaleHook "${SWIFT_FLAGS[@]}")

BIN_DIR="$(cd "$ROOT" && swift build -c "$CONFIG" --show-bin-path)"

echo ">> bundling $APP_DIR"
rm -rf "$APP_DIR"
mkdir -p "$CONTENTS/MacOS" "$CONTENTS/Resources"

cp "$BIN_DIR/Tokscale" "$CONTENTS/MacOS/Tokscale"
cp "$BIN_DIR/TokscaleHook" "$CONTENTS/MacOS/tokscale-hook"
cp "$ROOT/Resources/Info.plist" "$CONTENTS/Info.plist"

# Copy runtime resource bundles to the .app root. SwiftPM's generated
# `resource_bundle_accessor.swift` resolves `Bundle.main.bundleURL/X.bundle`,
# which at runtime is the .app directory — not Contents/Resources/. Putting
# them there would only work on the build machine via the hard-coded build
# path fallback.
shopt -s nullglob
for bundle in "$BIN_DIR"/*.bundle; do
    name="$(basename "$bundle")"
    case "$name" in
        *Tests.bundle) continue ;;
    esac
    cp -R "$bundle" "$APP_DIR/"
done

# Ad-hoc sign so the launcher accepts it locally
codesign --force --deep --sign - "$APP_DIR"

echo ">> done: $APP_DIR"
