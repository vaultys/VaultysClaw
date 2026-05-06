#!/usr/bin/env bash
# package-macos.sh — Create macOS .app bundle and .dmg installer.
#
# Prerequisites:
#   - build-binaries.sh must have run first (produces agent-macos-arm64 and agent-macos-x64)
#   - lipo (Xcode Command Line Tools)
#   - hdiutil (built into macOS)
#
# Run from the agent-controller package root:
#   bash scripts/package-macos.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PKG_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BIN_DIR="$PKG_DIR/dist-bin"
DIST_DIR="$PKG_DIR/dist-macos"
APP_NAME="VaultysClaw Agent"
BUNDLE_ID="com.vaultysclaw.agent"
VERSION="0.0.1"

APP_DIR="$DIST_DIR/${APP_NAME}.app"
MACOS_DIR="$APP_DIR/Contents/MacOS"
RESOURCES_DIR="$APP_DIR/Contents/Resources"

rm -rf "$DIST_DIR"
mkdir -p "$MACOS_DIR" "$RESOURCES_DIR"

echo "==> Creating universal binary with lipo..."
lipo -create \
  "$BIN_DIR/agent-macos-arm64" \
  "$BIN_DIR/agent-macos-x64" \
  -output "$MACOS_DIR/agent"
chmod +x "$MACOS_DIR/agent"
echo "    done: $(du -sh "$MACOS_DIR/agent" | cut -f1)"

echo "==> Writing Info.plist..."
cat > "$APP_DIR/Contents/Info.plist" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleIdentifier</key>
  <string>$BUNDLE_ID</string>
  <key>CFBundleName</key>
  <string>$APP_NAME</string>
  <key>CFBundleDisplayName</key>
  <string>$APP_NAME</string>
  <key>CFBundleExecutable</key>
  <string>agent</string>
  <key>CFBundleVersion</key>
  <string>$VERSION</string>
  <key>CFBundleShortVersionString</key>
  <string>$VERSION</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>LSMinimumSystemVersion</key>
  <string>12.0</string>
  <key>LSUIElement</key>
  <true/>
</dict>
</plist>
EOF

echo "==> Creating .dmg..."
DMG_PATH="$PKG_DIR/dist-bin/vaultysclaw-agent-macos-${VERSION}.dmg"
hdiutil create \
  -volname "${APP_NAME}" \
  -srcfolder "$DIST_DIR" \
  -ov \
  -format UDZO \
  "$DMG_PATH"

echo ""
echo "==> macOS packaging complete:"
echo "    App bundle: $APP_DIR"
echo "    DMG:        $DMG_PATH"
