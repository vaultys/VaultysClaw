#!/usr/bin/env bash
# Run the demo seeder from any working directory.
# tsx lives in the control-plane package (where better-sqlite3 also resolves).

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CP_DIR="$REPO_ROOT/packages/control-plane"
DEMO_DIR="$REPO_ROOT/demo"
TSX="$CP_DIR/node_modules/.bin/tsx"

if [[ ! -f "$TSX" ]]; then
  echo "tsx not found at $TSX — run 'pnpm install' first."
  exit 1
fi

# Check for database in demo directory first (new data-folder structure), then fallback to control-plane directory
DB=""
if [[ -f "$DEMO_DIR/data/vaultysclaw.db" ]]; then
  DB="$DEMO_DIR/data/vaultysclaw.db"
elif [[ -f "$CP_DIR/data/vaultysclaw.db" ]]; then
  DB="$CP_DIR/data/vaultysclaw.db"
fi

if [[ -z "$DB" ]] || [[ ! -f "$DB" ]]; then
  echo "Database not found"
  echo "Expected locations:"
  echo "  - $DEMO_DIR/data/vaultysclaw.db (if using ./demo/setup.sh)"
  echo "  - $CP_DIR/data/vaultysclaw.db (if using pnpm vaultysclaw:dev)"
  echo ""
  echo "Start the control plane at least once before seeding."
  exit 1
fi

echo "Using database: $DB"
echo "Seeding VaultysClaw demo data..."
cd "$CP_DIR"
"$TSX" "$REPO_ROOT/demo/seed.ts"
