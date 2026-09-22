#!/usr/bin/env bash
# Supported local setup. No host Node/pnpm install and no system package changes.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="$SCRIPT_DIR/docker/quickstart.env"
MODE=start
for arg in "$@"; do
  case "$arg" in
    --check) MODE=check ;;
    --down) MODE=down ;;
    --logs) MODE=logs ;;
    -y|--yes) ;; # Compatibility: setup is now non-interactive.
    -h|--help)
      cat <<'HELP'
Usage: ./quick-start.sh [--check | --down | --logs]

Start an isolated local stack at http://localhost:3010/login.
Requires Docker with Compose 2.24.4+ and OpenSSL; first build takes several minutes.
Creates docker/quickstart.env once and preserves existing credentials and data.

  --check   Check prerequisites without creating files or starting services
  --down    Stop this local stack, keeping its data
  --logs    Follow this local stack's logs
  --yes     Accepted for compatibility; no prompts are used
HELP
      exit 0 ;;
    *) printf 'Unknown option: %s. Use --help.\n' "$arg" >&2; exit 2 ;;
  esac
done

fail() { printf '[quick-start] %s\n' "$*" >&2; exit 1; }
check_docker() {
  command -v docker >/dev/null 2>&1 || fail "Install Docker with Compose, then rerun this command."
  local version major minor patch
  version="$(docker compose version --short)" || fail "Docker Compose is required."
  version="${version#v}"
  IFS=. read -r major minor patch <<< "$version"
  patch="${patch%%[^0-9]*}"
  [[ "$major" =~ ^[0-9]+$ && "$minor" =~ ^[0-9]+$ && "$patch" =~ ^[0-9]+$ ]] || fail "Cannot read Compose version: $version"
  if (( major < 2 || (major == 2 && (minor < 24 || (minor == 24 && patch < 4))) )); then
    fail "Docker Compose 2.24.4+ is required (found $version)."
  fi
  docker info >/dev/null 2>&1 || fail "Docker is not reachable. Start Docker and check socket access, then retry."
}

compose() (
  # The local env file is authoritative; inherited deployment settings must not
  # redirect this stack's database, queue, login URL or build configuration.
  unset PG_PASSWORD PG_PORT REDIS_URL REDIS_PORT NEXTAUTH_SECRET NEXTAUTH_URL APP_URL
  unset CONTROLPLANE_PORT CONTROLPLANE_WS_PORT APPRISE_API_URL BULLMQ_PREFIX WEBHOOK_TIMEOUT_MS
  unset NEXT_PUBLIC_WALLET_URL NEXT_PUBLIC_MAP_TILE_URL NEXT_PUBLIC_ALLOW_DEV_LOGIN
  unset LITELLM_BASE_URL LITELLM_MASTER_KEY
  docker compose --project-name vaultysclaw-quickstart \
    --env-file "$ENV_FILE" \
    -f "$SCRIPT_DIR/docker/docker-compose.yml" \
    -f "$SCRIPT_DIR/docker/docker-compose.quickstart.yml" "$@"
)

check_docker
if [[ "$MODE" == down || "$MODE" == logs ]]; then
  [[ -f "$ENV_FILE" ]] || fail "No local setup found. Run ./quick-start.sh first."
  if [[ "$MODE" == down ]]; then compose down; else compose logs -f; fi
  exit 0
fi
command -v openssl >/dev/null 2>&1 || fail "OpenSSL is required to generate local credentials."
if [[ "$MODE" == check ]]; then
  printf '[quick-start] Prerequisites ready. Run ./quick-start.sh to start.\n'
  exit 0
fi

if [[ ! -e "$ENV_FILE" ]]; then
  # Generate before opening the file, and use noclobber to preserve a concurrent setup.
  db_secret="$(openssl rand -hex 24)"
  auth_secret="$(openssl rand -hex 32)"
  (
    umask 077
    set -o noclobber
    printf 'PG_PASSWORD=%s\nNEXTAUTH_SECRET=%s\n' "$db_secret" "$auth_secret" > "$ENV_FILE"
  )
fi
for key in PG_PASSWORD NEXTAUTH_SECRET; do
  grep -Eq "^${key}=[A-Za-z0-9+/=_-]{16,}$" "$ENV_FILE" || fail "$ENV_FILE needs a valid $key (at least 16 characters). Existing credentials were preserved."
done
compose config --quiet
printf '[quick-start] Building and starting the local stack. First build may take several minutes.\n'
if ! compose up --build -d --wait --wait-timeout 300; then
  printf '[quick-start] Startup failed. Inspect with ./quick-start.sh --logs; retry with ./quick-start.sh.\n' >&2
  exit 1
fi
printf '\nReady: http://localhost:3010/login\nChoose "Create a VaultysID in this browser" to register your first administrator.\nAgent WebSocket: ws://localhost:8090\nStop and keep data: ./quick-start.sh --down\n'
