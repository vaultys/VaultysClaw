#!/usr/bin/env bash
# build-binaries.sh — Compile self-contained agent binaries for all platforms.
#
# Prerequisites: Bun >= 1.1.0  (bun.sh)
# Run from the agent-controller package root:
#   bash scripts/build-binaries.sh
#
# Output → dist-bin/
#   agent-macos-arm64
#   agent-macos-x64
#   agent-linux-x64
#   agent-linux-arm64
#   agent-windows-x64.exe

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PKG_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
OUT_DIR="$PKG_DIR/dist-bin"
ENTRY="$PKG_DIR/src/cli.ts"

# Copy the public web assets next to the entry so Bun can embed them
WEB_PUBLIC="$PKG_DIR/src/web/public"

mkdir -p "$OUT_DIR"

echo "==> Building agent binaries..."
echo "    entry:  $ENTRY"
echo "    output: $OUT_DIR"
echo ""

# Targets:  bun-<os>-<arch>
declare -A TARGETS=(
  ["macos-arm64"]="bun-darwin-arm64"
  ["macos-x64"]="bun-darwin-x64"
  ["linux-x64"]="bun-linux-x64"
  ["linux-arm64"]="bun-linux-arm64"
  ["windows-x64"]="bun-windows-x64"
)

for NAME in "${!TARGETS[@]}"; do
  TARGET="${TARGETS[$NAME]}"
  EXT=""
  [[ "$NAME" == windows* ]] && EXT=".exe"
  OUT="$OUT_DIR/agent-${NAME}${EXT}"

  echo "--> [$NAME] target=$TARGET"
  bun build \
    --compile \
    --target="$TARGET" \
    --outfile="$OUT" \
    "$ENTRY"

  echo "    built: $OUT ($(du -sh "$OUT" | cut -f1))"
done

echo ""
echo "==> All binaries built in $OUT_DIR"
ls -lh "$OUT_DIR"
