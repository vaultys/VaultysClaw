#!/usr/bin/env bash
# Run the demo seeder from any working directory.
# tsx lives in the control-plane package (where better-sqlite3 also resolves).

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CP_DIR="$REPO_ROOT/packages/control-plane"
TSX="$CP_DIR/node_modules/.bin/tsx"

if [[ ! -f "$TSX" ]]; then
  echo "tsx not found at $TSX — run 'pnpm install' first."
  exit 1
fi

DB="$CP_DIR/data/vaultysclaw.db"
if [[ ! -f "$DB" ]]; then
  echo "Database not found at $DB"
  echo "Start the control plane at least once (pnpm vaultysclaw:dev) before seeding."
  exit 1
fi

echo "Seeding VaultysClaw demo data..."
cd "$CP_DIR"
"$TSX" "$REPO_ROOT/demo/seed.ts"
