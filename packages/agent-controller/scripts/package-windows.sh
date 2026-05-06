#!/usr/bin/env bash
# package-windows.sh — Create Windows .zip and NSIS installer (.exe setup).
#
# Prerequisites:
#   - build-binaries.sh must have run first (produces agent-windows-x64.exe)
#   - zip (usually available on macOS/Linux)
#   - makensis (NSIS, optional for installer): brew install nsis  |  apt install nsis
#
# Run from the agent-controller package root:
#   bash scripts/package-windows.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PKG_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BIN_DIR="$PKG_DIR/dist-bin"
VERSION="0.0.1"
BIN="$BIN_DIR/agent-windows-x64.exe"

if [[ ! -f "$BIN" ]]; then
  echo "ERROR: $BIN not found. Run build-binaries.sh first."
  exit 1
fi

# ---- .zip archive ----

TMPDIR="$(mktemp -d)"
cp "$BIN" "$TMPDIR/agent.exe"

if [[ -d "$PKG_DIR/src/web/public" ]]; then
  cp -r "$PKG_DIR/src/web/public" "$TMPDIR/web-public"
fi

cat > "$TMPDIR/README.txt" << EOF
VaultysClaw Agent Controller v${VERSION}
=========================================
Usage (Command Prompt or PowerShell):
  agent.exe                           # headless mode
  agent.exe --mode web --port 3002    # web dashboard at http://localhost:3002
  agent.exe --help                    # show all options
  agent.exe --install-service         # add to Windows Task Scheduler

To start automatically at logon, run with --install-service and then execute
the generated .bat file as Administrator.
EOF

ZIP="$BIN_DIR/vaultysclaw-agent-windows-x64-${VERSION}.zip"
(cd "$TMPDIR" && zip -r "$ZIP" .)
rm -rf "$TMPDIR"
echo "==> Windows zip: $ZIP ($(du -sh "$ZIP" | cut -f1))"

# ---- NSIS installer (optional) ----

if command -v makensis &>/dev/null; then
  NSI="$BIN_DIR/installer.nsi"
  INSTALLER="$BIN_DIR/vaultysclaw-agent-windows-x64-${VERSION}-setup.exe"

  cat > "$NSI" << EOF
!include "MUI2.nsh"
Name "VaultysClaw Agent ${VERSION}"
OutFile "${INSTALLER}"
InstallDir "\$PROGRAMFILES64\\VaultysClaw\\Agent"
RequestExecutionLevel admin

!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "English"

Section "Install"
  SetOutPath "\$INSTDIR"
  File "${BIN}"
  WriteUninstaller "\$INSTDIR\\Uninstall.exe"
  WriteRegStr HKLM "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\VaultysClaw Agent" \\
    "DisplayName" "VaultysClaw Agent"
  WriteRegStr HKLM "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\VaultysClaw Agent" \\
    "UninstallString" "\$INSTDIR\\Uninstall.exe"
  CreateShortcut "\$SMPROGRAMS\\VaultysClaw Agent.lnk" "\$INSTDIR\\agent.exe"
SectionEnd

Section "Uninstall"
  Delete "\$INSTDIR\\agent.exe"
  Delete "\$INSTDIR\\Uninstall.exe"
  RMDir "\$INSTDIR"
  DeleteRegKey HKLM "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\VaultysClaw Agent"
SectionEnd
EOF

  makensis "$NSI"
  rm -f "$NSI"
  echo "==> NSIS installer: $INSTALLER"
else
  echo "(makensis not found — skipping NSIS installer. Install: brew install nsis | apt install nsis)"
fi

echo ""
echo "==> Windows packaging complete."
