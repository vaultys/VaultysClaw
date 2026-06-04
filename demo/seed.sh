#!/usr/bin/env bash
# Run the demo seeder from any working directory.
# tsx and Prisma client are resolved from the control-plane package.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CP_DIR="$REPO_ROOT/packages/control-plane"
DEMO_DIR="$REPO_ROOT/demo"
TSX="$CP_DIR/node_modules/.bin/tsx"

if [[ ! -f "$TSX" ]]; then
  echo "tsx not found at $TSX — run 'pnpm install' first."
  exit 1
fi

# Resolve DATABASE_URL from env or control-plane .env files.
if [[ -z "${DATABASE_URL:-}" ]]; then
  for env_file in "$CP_DIR/.env.local" "$CP_DIR/.env" "$DEMO_DIR/data/.env"; do
    if [[ -f "$env_file" ]]; then
      found=$(grep -E "^DATABASE_URL=" "$env_file" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"' || true)
      if [[ -n "$found" ]]; then
        export DATABASE_URL="$found"
        break
      fi
    fi
  done
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL not found."
  echo "Set it in one of:"
  echo "  - $CP_DIR/.env.local"
  echo "  - $CP_DIR/.env"
  echo "or export DATABASE_URL before running this script."
  exit 1
fi

echo "Using DATABASE_URL from environment/.env"
echo "Seeding VaultysClaw demo data (Prisma)..."
cd "$CP_DIR"
"$TSX" "$REPO_ROOT/demo/seed.ts"
