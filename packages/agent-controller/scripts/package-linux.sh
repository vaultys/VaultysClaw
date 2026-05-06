#!/usr/bin/env bash
# package-linux.sh — Create Linux .tar.gz archive and AppImage.
#
# Prerequisites:
#   - build-binaries.sh must have run first
#   - appimagetool (optional, for AppImage): https://github.com/AppImage/AppImageKit
#
# Run from the agent-controller package root:
#   bash scripts/package-linux.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PKG_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BIN_DIR="$PKG_DIR/dist-bin"
VERSION="0.0.1"

# ---- .tar.gz archives ----

for ARCH in x64 arm64; do
  BIN="$BIN_DIR/agent-linux-${ARCH}"
  if [[ ! -f "$BIN" ]]; then
    echo "Skipping linux-${ARCH}: binary not found"
    continue
  fi
  TARBALL="$BIN_DIR/vaultysclaw-agent-linux-${ARCH}-${VERSION}.tar.gz"
  TMPDIR="$(mktemp -d)"
  cp "$BIN" "$TMPDIR/agent"
  chmod +x "$TMPDIR/agent"

  # Include web public assets alongside binary
  if [[ -d "$PKG_DIR/src/web/public" ]]; then
    cp -r "$PKG_DIR/src/web/public" "$TMPDIR/web-public"
  fi

  # Minimal README
  cat > "$TMPDIR/README.txt" << EOF
VaultysClaw Agent Controller v${VERSION}
=========================================
Usage:
  ./agent                           # headless mode
  ./agent --mode tui                # terminal dashboard
  ./agent --mode web --port 3002    # web dashboard at http://localhost:3002
  ./agent --help                    # show all options
  ./agent --install-service         # install as systemd user service
EOF

  tar -czf "$TARBALL" -C "$TMPDIR" .
  rm -rf "$TMPDIR"
  echo "==> Linux tarball: $TARBALL ($(du -sh "$TARBALL" | cut -f1))"
done

# ---- AppImage (x64 only, if appimagetool is available) ----

if command -v appimagetool &>/dev/null; then
  BIN="$BIN_DIR/agent-linux-x64"
  if [[ -f "$BIN" ]]; then
    APP_DIR="$BIN_DIR/vaultysclaw-agent.AppDir"
    mkdir -p "$APP_DIR/usr/bin" "$APP_DIR/usr/share/applications" "$APP_DIR/usr/share/icons/hicolor/256x256/apps"

    cp "$BIN" "$APP_DIR/usr/bin/agent"
    chmod +x "$APP_DIR/usr/bin/agent"

    # Desktop entry
    cat > "$APP_DIR/usr/share/applications/vaultysclaw-agent.desktop" << EOF
[Desktop Entry]
Name=VaultysClaw Agent
Exec=agent
Icon=vaultysclaw-agent
Type=Application
Categories=Utility;
EOF

    # AppRun entry point
    cat > "$APP_DIR/AppRun" << 'EOF'
#!/bin/bash
exec "$(dirname "$0")/usr/bin/agent" "$@"
EOF
    chmod +x "$APP_DIR/AppRun"

    # Placeholder icon (1x1 PNG — replace with real icon)
    if [[ ! -f "$APP_DIR/usr/share/icons/hicolor/256x256/apps/vaultysclaw-agent.png" ]]; then
      printf '\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x01\x00\x00\x00\x01\x00\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\xf8\x0f\x00\x00\x01\x01\x00\x05\x18\xd8N\x00\x00\x00\x00IEND\xaeB`\x82' \
        > "$APP_DIR/usr/share/icons/hicolor/256x256/apps/vaultysclaw-agent.png"
    fi

    APPIMAGE="$BIN_DIR/vaultysclaw-agent-linux-x64-${VERSION}.AppImage"
    ARCH=x86_64 appimagetool "$APP_DIR" "$APPIMAGE"
    rm -rf "$APP_DIR"
    echo "==> AppImage: $APPIMAGE ($(du -sh "$APPIMAGE" | cut -f1))"
  fi
else
  echo "(appimagetool not found — skipping AppImage. Install from https://github.com/AppImage/AppImageKit)"
fi

echo ""
echo "==> Linux packaging complete."
ls -lh "$BIN_DIR"/*.tar.gz 2>/dev/null || true
ls -lh "$BIN_DIR"/*.AppImage 2>/dev/null || true
