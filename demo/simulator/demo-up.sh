#!/usr/bin/env bash
# =============================================================================
# demo/demo-up.sh — VaultysClaw full demo environment
#
# Sandboxes ALL environment variables, creates dedicated Docker containers
# for PostgreSQL, MinIO and Docling, then starts the control plane and the
# 30-agent simulator.  Nothing touches your existing .env files.
#
# Usage:
#   chmod +x demo/demo-up.sh
#   ./demo/demo-up.sh [flags]
#
# Flags:
#   --skip-minio       Don't start MinIO  (uses filesystem storage instead)
#   --skip-docling     Don't start Docling
#   --skip-seed        Skip simulator:seed (re-use existing data)
#   --no-simulator     Start services only; don't launch the 30-agent fleet
#   --fresh            Wipe demo DB and Docker volumes before starting
#   --help             Print this message
#
# On first run the script auto-generates a secrets file at
# demo/.env.demo  — review it and re-run.  All subsequent runs re-use the
# same secrets (edit the file to change anything).
#
# Stop everything:  Ctrl+C  — all processes and Docker containers are
# cleaned up automatically.
# =============================================================================

set -euo pipefail

# ── Paths ────────────────────────────────────────────────────────────────────

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DEMO_DIR="$REPO_ROOT/demo"
CP_DIR="$REPO_ROOT/packages/control-plane"
DATA_DIR="$DEMO_DIR/data"
LOG_DIR="$DEMO_DIR/logs"
SIM_DIR="$DEMO_DIR/simulator"
IDENTITIES_DIR="$SIM_DIR/identities"
ENV_FILE="$DEMO_DIR/.env.demo"
PIDS_FILE="$DEMO_DIR/.demo-sim-pids"
DOCKER_CONTAINERS_FILE="$DEMO_DIR/.demo-sim-containers"

# ── Flags ────────────────────────────────────────────────────────────────────

SKIP_MINIO=false
SKIP_DOCLING=false
SKIP_PEERJS=false
SKIP_SEED=false
NO_SIMULATOR=false
FRESH=false

for arg in "$@"; do
  case "$arg" in
    --skip-minio)    SKIP_MINIO=true ;;
    --skip-docling)  SKIP_DOCLING=true ;;
    --skip-peerjs)   SKIP_PEERJS=true ;;
    --skip-seed)     SKIP_SEED=true ;;
    --no-simulator)  NO_SIMULATOR=true ;;
    --fresh)         FRESH=true ;;
    --help|-h)
      sed -n '3,27p' "$0" | sed 's/^# \?//'
      exit 0
      ;;
  esac
done

# ── Colours ──────────────────────────────────────────────────────────────────

if [[ -t 1 ]]; then
  GREEN='\033[0;32m'  YELLOW='\033[1;33m'  RED='\033[0;31m'
  CYAN='\033[0;36m'   BOLD='\033[1m'       NC='\033[0m'
else
  GREEN='' YELLOW='' RED='' CYAN='' BOLD='' NC=''
fi

log()   { echo -e "${GREEN}▶${NC}  $*"; }
warn()  { echo -e "${YELLOW}⚠${NC}   $*"; }
err()   { echo -e "${RED}✗${NC}   $*" >&2; }
step()  { echo -e "\n${CYAN}${BOLD}── $* ──────────────────────────────────${NC}"; }
banner(){ echo -e "${CYAN}${BOLD}$*${NC}"; }

# ── Cleanup ───────────────────────────────────────────────────────────────────

cleanup() {
  echo
  log "Shutting down demo environment…"

  # Kill Node.js processes (control plane, simulator, peerjs agents)
  if [[ -f "$PIDS_FILE" ]]; then
    while IFS= read -r pid; do
      [[ -n "$pid" ]] && kill "$pid" 2>/dev/null || true
    done < "$PIDS_FILE"
    rm -f "$PIDS_FILE"
  fi

  # STOP Docker containers (preserves volumes & data for next run).
  # Use docker rm -f only on --fresh; here we just stop.
  for cname in "${PG_CONTAINER:-}" "${MINIO_CONTAINER:-}" "${DOCLING_CONTAINER:-}" "${PEERJS_CONTAINER:-}"; do
    [[ -z "$cname" ]] && continue
    if docker inspect "$cname" &>/dev/null 2>&1; then
      docker stop "$cname" >/dev/null 2>&1 || true
      log "Stopped container $cname (data preserved — use --fresh to wipe)"
    fi
  done

  # Clean up the "newly created" tracking file (no longer needed after stop)
  rm -f "$DOCKER_CONTAINERS_FILE"

  log "Done. Goodbye."
}

trap cleanup EXIT INT TERM

# ── Helper: check tool available ─────────────────────────────────────────────

need() {
  command -v "$1" &>/dev/null || { err "$1 is required but not found. Please install it."; exit 1; }
}

have_docker() { command -v docker &>/dev/null && docker info &>/dev/null 2>&1; }

# ── Wait for HTTP endpoint ────────────────────────────────────────────────────

wait_http() {
  local url="$1" label="$2" secs="${3:-60}"
  log "Waiting for $label ($url)…"
  for i in $(seq 1 "$secs"); do
    if curl -sf --max-time 2 "$url" >/dev/null 2>&1; then
      log "$label is ready."
      return 0
    fi
    sleep 1
    [[ $((i % 10)) -eq 0 ]] && echo "    …${i}s elapsed"
  done
  warn "$label did not respond within ${secs}s — it may still be starting."
}

# ── Wait for PostgreSQL ───────────────────────────────────────────────────────

wait_postgres() {
  local host="$1" port="$2" user="$3" secs="${4:-30}"
  log "Waiting for PostgreSQL at ${host}:${port}…"
  for i in $(seq 1 "$secs"); do
    if pg_isready -h "$host" -p "$port" -U "$user" -q 2>/dev/null; then
      log "PostgreSQL is ready."
      return 0
    fi
    sleep 1
  done
  # pg_isready might not be installed — fall back to docker exec
  if docker exec "$PG_CONTAINER" pg_isready -U "$PG_USER" -q 2>/dev/null; then
    log "PostgreSQL is ready (via docker exec)."
    return 0
  fi
  warn "PostgreSQL did not respond within ${secs}s — continuing anyway."
}

# ── Sync PostgreSQL password ──────────────────────────────────────────────────
# PostgreSQL ignores POSTGRES_PASSWORD on an existing data volume (it only
# applies during initdb). On restarts after --fresh, the volume may hold a
# password from a previous run. This function detects the mismatch and resets
# the password via the postgres OS-user socket (trust auth, TCP not needed).

sync_postgres_password() {
  # Quick TCP auth test — if this passes the password is already correct.
  if docker exec "$PG_CONTAINER" \
       env PGPASSWORD="$PG_PASSWORD" \
       psql -h localhost -U "$PG_USER" -d "$PG_DB" -c "SELECT 1;" \
       >/dev/null 2>&1; then
    return 0
  fi

  warn "PostgreSQL password mismatch (volume has an old password)."
  warn "Resetting password for user '${PG_USER}' via superuser socket…"

  # The postgres OS user has implicit trust access over the Unix socket.
  # We run ALTER USER to update the stored hash to match our current secret.
  if docker exec --user postgres "$PG_CONTAINER" \
       psql -c "ALTER USER \"${PG_USER}\" WITH PASSWORD '${PG_PASSWORD}';" \
       >/dev/null 2>&1; then
    log "Password reset ✓"
  else
    # Fallback: try without specifying a user (connects as postgres)
    docker exec "$PG_CONTAINER" \
      psql -U postgres \
      -c "ALTER USER \"${PG_USER}\" WITH PASSWORD '${PG_PASSWORD}';" \
      >/dev/null 2>&1 || true
  fi

  # Final verification
  if docker exec "$PG_CONTAINER" \
       env PGPASSWORD="$PG_PASSWORD" \
       psql -h localhost -U "$PG_USER" -d "$PG_DB" -c "SELECT 1;" \
       >/dev/null 2>&1; then
    log "PostgreSQL auth verified ✓"
  else
    err "Could not sync PostgreSQL password."
    err "Run with --fresh to wipe the volume and start clean."
    exit 1
  fi
}

# =============================================================================
# Step 1 — Prerequisites
# =============================================================================
step "Prerequisites"

need pnpm
need node
need openssl

if ! have_docker; then
  err "Docker is not available or not running."
  err "Install Docker Desktop (https://docs.docker.com/desktop/) and retry."
  exit 1
fi

# =============================================================================
# Step 2 — Fixed operational constants (never stored in .env.demo)
# =============================================================================

# Container names and ports are fixed — not user-configurable secrets.
# Defined here so every run uses the same values regardless of what was
# written in an older .env.demo file.
PG_CONTAINER="vc-demo-postgres"
PG_HOST="127.0.0.1"
PG_PORT="5433"
PG_USER="vcdemo"
PG_DB="vaultysclaw_demo"

MINIO_CONTAINER="vc-demo-minio"
MINIO_API_PORT="9000"
MINIO_CONSOLE_PORT="9001"
MINIO_ROOT_USER="minioadmin"
MINIO_ROOT_PASSWORD="minioadmin123"
MINIO_BUCKET="vc-demo-files"
MINIO_REGION="us-east-1"

DOCLING_CONTAINER="vc-demo-docling"
DOCLING_PORT="5001"

PEERJS_CONTAINER="vc-demo-peerjs"
PEERJS_PORT="9002"
PEERJS_ENABLED="true"

NODE_ENV="development"
PORT="3000"
WS_PORT="8080"
NEXTAUTH_URL="http://localhost:3000"
CONTROL_PLANE_URL="http://localhost:3000"
CONTROL_PLANE_WS_URL="ws://localhost:8080"

# =============================================================================
# Step 3 — Generated secrets (stored in .env.demo, created once)
# =============================================================================
step "Environment"

mkdir -p "$DATA_DIR" "$LOG_DIR"
> "$PIDS_FILE"
> "$DOCKER_CONTAINERS_FILE"

if [[ ! -f "$ENV_FILE" ]]; then
  log "Generating demo secrets → $ENV_FILE"

  # Only secrets that vary per-deployment go here.
  # Everything else is hardcoded above so the file stays minimal and
  # old versions never cause "unbound variable" failures.
  NEXTAUTH_SECRET_GEN=$(openssl rand -base64 32)
  PG_PASSWORD_GEN=$(openssl rand -hex 16)

  # Use printf to avoid any heredoc encoding issues with multi-byte chars
  printf '# VaultysClaw Demo Secrets\n'                         > "$ENV_FILE"
  printf '# Generated: %s\n' "$(date -u +"%Y-%m-%d %H:%M UTC")" >> "$ENV_FILE"
  printf '# These are the ONLY values that change per deployment.\n\n' >> "$ENV_FILE"
  printf 'PG_PASSWORD=%s\n' "$PG_PASSWORD_GEN"                  >> "$ENV_FILE"
  printf 'DATABASE_URL=postgresql://%s:%s@127.0.0.1:%s/%s\n' \
    "$PG_USER" "$PG_PASSWORD_GEN" "$PG_PORT" "$PG_DB"           >> "$ENV_FILE"
  printf 'NEXTAUTH_SECRET=%s\n' "$NEXTAUTH_SECRET_GEN"          >> "$ENV_FILE"

  log "Created $ENV_FILE"
else
  log "Re-using existing $ENV_FILE"
fi

# Source secrets file — only PG_PASSWORD, DATABASE_URL, NEXTAUTH_SECRET
# are loaded from it; everything else is already set above.
# tr -d '\r' strips any Windows-style carriage returns that corrupt variable names.
while IFS='=' read -r key value; do
  # Skip blank lines and comments
  [[ -z "$key" || "$key" == \#* ]] && continue
  # Strip any trailing \r (CRLF safety)
  key="${key%$'\r'}"
  value="${value%$'\r'}"
  export "$key"="$value"
done < "$ENV_FILE"

export DATABASE_URL NEXTAUTH_SECRET
export NODE_ENV PORT WS_PORT NEXTAUTH_URL

log "Environment loaded:"
log "  DATABASE_URL      = ${DATABASE_URL}"
log "  NEXTAUTH_URL      = ${NEXTAUTH_URL}"
log "  Control Plane URL = ${CONTROL_PLANE_URL}"
log "  WS URL            = ${CONTROL_PLANE_WS_URL}"

# =============================================================================
# Step 4 — Fresh wipe (if --fresh)
# =============================================================================

if $FRESH; then
  step "Fresh wipe"
  warn "Wiping demo containers and volumes (--fresh)…"
  docker rm -f "${PG_CONTAINER}" "${MINIO_CONTAINER}" "${DOCLING_CONTAINER}" "${PEERJS_CONTAINER}" 2>/dev/null || true
  docker volume rm "vc-demo-pgdata" "vc-demo-miniodata" 2>/dev/null || true
  # Also wipe the generated env and simulator identities so secrets are regenerated
  rm -f "$ENV_FILE"
  rm -rf "$IDENTITIES_DIR" 2>/dev/null || true
  log "Wipe complete — env and identities will be regenerated."
fi

# =============================================================================
# Step 4 — PostgreSQL
# =============================================================================
step "PostgreSQL"

if docker inspect "$PG_CONTAINER" &>/dev/null 2>&1; then
  if [[ "$(docker inspect -f '{{.State.Running}}' "$PG_CONTAINER")" != "true" ]]; then
    log "Starting existing $PG_CONTAINER"
    docker start "$PG_CONTAINER" >/dev/null
  else
    log "$PG_CONTAINER is already running."
  fi
else
  log "Creating $PG_CONTAINER on port ${PG_PORT}…"
  docker run -d \
    --name "$PG_CONTAINER" \
    -e "POSTGRES_USER=${PG_USER}" \
    -e "POSTGRES_PASSWORD=${PG_PASSWORD}" \
    -e "POSTGRES_DB=${PG_DB}" \
    -p "${PG_PORT}:5432" \
    -v "vc-demo-pgdata:/var/lib/postgresql/data" \
    postgres:16-alpine \
    >/dev/null
fi

wait_postgres "127.0.0.1" "$PG_PORT" "$PG_USER" 30
sync_postgres_password

# =============================================================================
# Step 5 — MinIO
# =============================================================================

if ! $SKIP_MINIO; then
  step "MinIO"

  if docker inspect "$MINIO_CONTAINER" &>/dev/null 2>&1; then
    if [[ "$(docker inspect -f '{{.State.Running}}' "$MINIO_CONTAINER")" != "true" ]]; then
      log "Starting existing $MINIO_CONTAINER"
      docker start "$MINIO_CONTAINER" >/dev/null
    else
      log "$MINIO_CONTAINER is already running."
    fi
  else
    log "Creating $MINIO_CONTAINER (API :${MINIO_API_PORT}, console :${MINIO_CONSOLE_PORT})…"
    docker run -d \
      --name "$MINIO_CONTAINER" \
      -p "${MINIO_API_PORT}:9000" \
      -p "${MINIO_CONSOLE_PORT}:9001" \
      -e "MINIO_ROOT_USER=${MINIO_ROOT_USER}" \
      -e "MINIO_ROOT_PASSWORD=${MINIO_ROOT_PASSWORD}" \
      -v "vc-demo-miniodata:/data" \
      minio/minio server /data --console-address ":9001" \
      >/dev/null
  fi

  wait_http "http://127.0.0.1:${MINIO_API_PORT}/minio/health/live" "MinIO" 30

  # Create the demo bucket via MinIO mc client (bundled inside the container)
  log "Ensuring bucket '${MINIO_BUCKET}' exists…"
  docker exec "$MINIO_CONTAINER" sh -c "
    mc alias set local http://localhost:9000 '${MINIO_ROOT_USER}' '${MINIO_ROOT_PASSWORD}' --quiet 2>/dev/null || true
    mc mb --ignore-existing local/${MINIO_BUCKET} 2>/dev/null || true
    echo 'Bucket OK'
  " 2>/dev/null && log "Bucket '${MINIO_BUCKET}' ready." || warn "Could not verify bucket — configure manually in Settings > Storage."
fi

# =============================================================================
# Step 6 — Docling
# =============================================================================

if ! $SKIP_DOCLING; then
  step "Docling"

  if docker inspect "$DOCLING_CONTAINER" &>/dev/null 2>&1; then
    if [[ "$(docker inspect -f '{{.State.Running}}' "$DOCLING_CONTAINER")" != "true" ]]; then
      log "Starting existing $DOCLING_CONTAINER"
      docker start "$DOCLING_CONTAINER" >/dev/null
    else
      log "$DOCLING_CONTAINER is already running."
    fi
  else
    local_image="quay.io/docling-project/docling-serve"
    if ! docker image inspect "$local_image" &>/dev/null 2>&1; then
      warn "Docling image not cached — first pull may take several minutes (~3 GB)."
    fi
    log "Creating $DOCLING_CONTAINER on port ${DOCLING_PORT}…"
    docker run -d \
      --name "$DOCLING_CONTAINER" \
      -p "${DOCLING_PORT}:5001" \
      "$local_image" \
      >/dev/null
  fi

  # Docling takes a while to initialise — check /health with generous timeout
  wait_http "http://127.0.0.1:${DOCLING_PORT}/health" "Docling" 120
fi

# =============================================================================
# Step 7 — PeerJS signalling server
# =============================================================================

if ! $SKIP_PEERJS; then
  step "PeerJS Signalling Server"

  if docker inspect "$PEERJS_CONTAINER" &>/dev/null 2>&1; then
    if [[ "$(docker inspect -f '{{.State.Running}}' "$PEERJS_CONTAINER")" != "true" ]]; then
      log "Starting existing $PEERJS_CONTAINER"
      docker start "$PEERJS_CONTAINER" >/dev/null
    else
      log "$PEERJS_CONTAINER is already running."
    fi
  else
    log "Creating $PEERJS_CONTAINER on port ${PEERJS_PORT}…"
    docker run -d \
      --name "$PEERJS_CONTAINER" \
      -p "${PEERJS_PORT}:9000" \
      peerjs/peerjs-server \
      >/dev/null
  fi

  wait_http "http://127.0.0.1:${PEERJS_PORT}/" "PeerJS" 30
fi

# =============================================================================
# Step 8 — Prisma schema push (idempotent)
# =============================================================================
step "Database schema"

log "Running prisma db push (DATABASE_URL=${DATABASE_URL})…"
(
  cd "$CP_DIR"
  DATABASE_URL="$DATABASE_URL" \
    pnpm exec prisma db push --accept-data-loss 2>&1 | sed 's/^/  /'
) || {
  err "Prisma db push failed. Check that PostgreSQL is reachable at ${DATABASE_URL}"
  exit 1
}
log "Schema is up to date."

# =============================================================================
# Step 9 — Control Plane
# =============================================================================
step "Control Plane"

if curl -sf --max-time 2 "${CONTROL_PLANE_URL}/api/health" >/dev/null 2>&1; then
  log "Control plane already running at ${CONTROL_PLANE_URL} — skipping start."
else
  log "Starting control plane…"

  # server.ts reads env vars from <data-dir>/.env, so write our sandboxed
  # values there. dotenv.config() doesn't override existing process.env vars,
  # but this ensures the values are available even if the shell export fails.
  mkdir -p "$DATA_DIR"
  cat > "$DATA_DIR/.env" <<CPENV
# Generated by demo-up.sh — do not edit manually
DATABASE_URL=${DATABASE_URL}
NEXTAUTH_URL=${NEXTAUTH_URL}
NEXTAUTH_SECRET=${NEXTAUTH_SECRET}
NODE_ENV=${NODE_ENV}
PORT=${PORT}
WS_PORT=${WS_PORT}
CPENV

  # Start using the same pattern as demo/setup.sh — no pipe through sed
  # so stdout goes straight to the log file without extra buffering.
  cd "$REPO_ROOT"
  DATABASE_URL="$DATABASE_URL" \
  NEXTAUTH_SECRET="$NEXTAUTH_SECRET" \
  NEXTAUTH_URL="$NEXTAUTH_URL" \
  NODE_ENV="$NODE_ENV" \
  PORT="$PORT" \
  WS_PORT="$WS_PORT" \
  PEERJS_ENABLED="${PEERJS_ENABLED:-false}" \
  PEERJS_SERVER_URL="http://127.0.0.1:${PEERJS_PORT:-9002}" \
  pnpm --filter @vaultysclaw/control-plane dev -- --data-dir "$DATA_DIR" \
    > "$LOG_DIR/control-plane.log" 2>&1 &
  CP_PID=$!
  echo "$CP_PID" >> "$PIDS_FILE"
  log "Control plane started (PID $CP_PID) → $LOG_DIR/control-plane.log"

  log "Waiting for control plane to be ready (this takes ~20-30s on first run)…"
  wait_http "${CONTROL_PLANE_URL}/api/health" "Control Plane" 90

  # Show last few log lines if still not up after 90s
  if ! curl -sf --max-time 2 "${CONTROL_PLANE_URL}/api/health" >/dev/null 2>&1; then
    warn "Control plane may not be fully ready. Last log lines:"
    tail -20 "$LOG_DIR/control-plane.log" | sed 's/^/    /'
  fi
fi

# =============================================================================
# Step 10 — Claim ownership (first-time setup)
# =============================================================================

# ── Helper: ask psql (inside the Docker container) whether an owner exists ──
# More reliable than tsx --eval which can fail silently at startup.
owner_exists_in_db() {
  local result
  result=$(docker exec "$PG_CONTAINER" \
    psql -U "$PG_USER" -d "$PG_DB" -t -c \
    "SELECT COUNT(*) FROM users WHERE is_owner = true;" \
    2>/dev/null | tr -d ' \n')
  [[ "$result" == "1" || "$result" -gt 0 ]] 2>/dev/null && echo "yes" || echo "no"
}

# Decide whether to show the ownership prompt:
#   --fresh  → DB was just wiped, definitely no owner
#   normal   → query the DB
NEEDS_OWNER_PROMPT=false
if $FRESH; then
  # Always prompt after a fresh wipe — no users exist yet
  NEEDS_OWNER_PROMPT=true
elif [[ "$(owner_exists_in_db)" != "yes" ]]; then
  # Normal restart but no owner in DB (first run, or DB was manually cleared)
  NEEDS_OWNER_PROMPT=true
fi

if $NEEDS_OWNER_PROMPT; then
  echo
  banner "╔══════════════════════════════════════════════════════════════╗"
  banner "║  ACTION REQUIRED — Claim ownership before seeding           ║"
  banner "╠══════════════════════════════════════════════════════════════╣"
  echo   "║"
  echo   "║  The control plane is ready but has no owner yet.           ║"
  echo   "║                                                              ║"
  echo   "║  1. Open  ${CONTROL_PLANE_URL}"
  echo   "║  2. Follow the setup wizard (QR-code login)                  ║"
  echo   "║  3. Complete the first-time owner registration               ║"
  echo   "║                                                              ║"
  echo   "║  Your account will be the demo owner and will receive        ║"
  echo   "║  human-approval requests from workflows.                     ║"
  echo   "║"
  banner "╚══════════════════════════════════════════════════════════════╝"
  echo
  read -r -p "  Press ENTER once you have claimed ownership → " _ignored

  # Confirm ownership was registered
  if [[ "$(owner_exists_in_db)" == "yes" ]]; then
    log "Owner registered ✓ — proceeding with seed."
  else
    warn "No owner found yet — the seed will run anyway."
    warn "Human-approval workflow steps won't have an assigned approver."
    warn "Re-run 'pnpm simulator:seed' after claiming ownership to fix this."
  fi
else
  log "Owner already exists — skipping ownership prompt."
fi

# =============================================================================
# Step 11 — Configure MinIO and Docling via REST API
# =============================================================================
step "Service configuration"

API_KEY="${DEMO_API_KEY:-vc-demo-0000-0000-0000-000000000001}"

configure_storage() {
  log "Configuring MinIO / S3 storage…"
  # Build payload without variable expansion issues (use printf instead of heredoc)
  local payload
  payload=$(printf '{"storageType":"s3","s3":{"enabled":true,"region":"%s","bucket":"%s","endpoint":"http://127.0.0.1:%s","accessKeyId":"%s","secretAccessKey":"%s"}}' \
    "${MINIO_REGION:-us-east-1}" "${MINIO_BUCKET:-vc-demo-files}" "${MINIO_API_PORT:-9000}" \
    "${MINIO_ROOT_USER:-minioadmin}" "${MINIO_ROOT_PASSWORD:-minioadmin123}")

  # Use -s (not -sf) and || true so a non-200 response never kills the script
  local status=""
  status=$(curl -s -o /dev/null -w "%{http_code}" \
    -X PUT "${CONTROL_PLANE_URL}/api/settings/storage" \
    -H "Content-Type: application/json" \
    -H "x-api-key: ${API_KEY}" \
    -d "$payload" 2>/dev/null) || true

  if [[ "$status" == "200" ]]; then
    log "MinIO storage configured (bucket: ${MINIO_BUCKET:-vc-demo-files} @ port ${MINIO_API_PORT:-9000})."
  elif [[ -z "$status" ]]; then
    warn "Could not reach control plane to configure storage (is it running?)."
    warn "Configure manually: Settings → Storage → S3"
    warn "  Endpoint  : http://127.0.0.1:${MINIO_API_PORT:-9000}"
    warn "  Bucket    : ${MINIO_BUCKET:-vc-demo-files}"
    warn "  Access key: ${MINIO_ROOT_USER:-minioadmin}"
    warn "  Secret    : ${MINIO_ROOT_PASSWORD:-minioadmin123}"
  else
    warn "Storage configuration returned HTTP ${status}."
    warn "Configure manually: Settings → Storage → S3"
    warn "  Endpoint  : http://127.0.0.1:${MINIO_API_PORT:-9000}"
    warn "  Bucket    : ${MINIO_BUCKET:-vc-demo-files}"
    warn "  Access key: ${MINIO_ROOT_USER:-minioadmin}"
    warn "  Secret    : ${MINIO_ROOT_PASSWORD:-minioadmin123}"
  fi
}

configure_docling() {
  log "Configuring Docling…"
  local payload
  payload=$(printf '{"url":"http://127.0.0.1:%s","enabled":true}' "${DOCLING_PORT:-5001}")

  local status=""
  status=$(curl -s -o /dev/null -w "%{http_code}" \
    -X PUT "${CONTROL_PLANE_URL}/api/settings/docling" \
    -H "Content-Type: application/json" \
    -H "x-api-key: ${API_KEY}" \
    -d "$payload" 2>/dev/null) || true

  if [[ "$status" == "200" ]]; then
    log "Docling configured (http://127.0.0.1:${DOCLING_PORT:-5001})."
  elif [[ -z "$status" ]]; then
    warn "Could not reach control plane to configure Docling."
    warn "Configure manually: Settings → Docling → URL = http://127.0.0.1:${DOCLING_PORT:-5001}"
  else
    warn "Docling configuration returned HTTP ${status}."
    warn "Configure manually: Settings → Docling → URL = http://127.0.0.1:${DOCLING_PORT:-5001}"
  fi
}

# The API key might not exist yet (seed hasn't run) — configure after seed
# so we defer these calls to after the seed step below.

# =============================================================================
# Step 12 — Demo seed
# =============================================================================
step "Demo seed"

if $SKIP_SEED; then
  log "--skip-seed specified — skipping seed."
else
  log "Running simulator:seed (generates agent identities, workflows, users)…"
  (
    cd "$REPO_ROOT"
    DATABASE_URL="$DATABASE_URL" pnpm simulator:seed 2>&1 | sed 's/^/  /'
  ) || {
    err "Demo seed failed. Check output above."
    exit 1
  }
fi

# Now configure services (API key exists after seed)
$SKIP_MINIO   || configure_storage
$SKIP_DOCLING || configure_docling

# =============================================================================
# Step 13 — Start simulator (30 fake agents)
# =============================================================================
step "Simulator"

if $NO_SIMULATOR; then
  log "--no-simulator specified — skipping simulator."
else
  log "Starting 30-agent simulator…"
  (
    cd "$REPO_ROOT"
    DATABASE_URL="$DATABASE_URL" \
    CONTROL_PLANE_URL="$CONTROL_PLANE_URL" \
    CONTROL_PLANE_WS_URL="$CONTROL_PLANE_WS_URL" \
    pnpm simulator:start 2>&1
  ) > "$LOG_DIR/simulator.log" 2>&1 &
  SIM_PID=$!
  echo "$SIM_PID" >> "$PIDS_FILE"
  log "Simulator started (PID $SIM_PID) → $LOG_DIR/simulator.log"

  # Give the simulator 10 s to start connecting, then show live output
  sleep 5
fi

# =============================================================================
# Step 14 — PeerJS agents (2 real agent-controller processes via WebRTC)
# =============================================================================

if ! $SKIP_PEERJS; then
  step "PeerJS Agents"

  # Get the control plane's PeerJS peer ID from /api/server
  SERVER_DID=""
  PEERJS_PEER_ID=""
  if curl -sf --max-time 5 "${CONTROL_PLANE_URL}/api/server" >/dev/null 2>&1; then
    SERVER_DID=$(curl -s "${CONTROL_PLANE_URL}/api/server" 2>/dev/null | \
      python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('identity',{}).get('did',''))" 2>/dev/null || true)
  fi

  if [[ -n "$SERVER_DID" ]]; then
    # PeerJS peer ID = sha256(serverDid) hex
    PEERJS_PEER_ID=$(echo -n "$SERVER_DID" | sha256sum | awk '{print $1}' 2>/dev/null || \
                     python3 -c "import hashlib,sys; print(hashlib.sha256('$SERVER_DID'.encode()).hexdigest())" 2>/dev/null || true)
    log "Server DID: ${SERVER_DID}"
    log "PeerJS peer ID: ${PEERJS_PEER_ID}"

    PEERJS_SERVER_URL_VAL="http://127.0.0.1:${PEERJS_PORT:-9002}"

    for pj_agent in "peerjs-analyst" "peerjs-orchestrator"; do
      pj_data="$DATA_DIR/peerjs-agents/$pj_agent"
      mkdir -p "$pj_data/.vaultys"

      log "Starting PeerJS agent: $pj_agent"
      CONTROL_PLANE_PEERJS_ID="$PEERJS_PEER_ID" \
      CONTROL_PLANE_PEERJS_SERVER="$PEERJS_SERVER_URL_VAL" \
      AGENT_NAME="$pj_agent" \
      VAULTYS_ID_PATH="$pj_data/.vaultys/agent.id" \
      NODE_ENV="development" \
      pnpm --filter @vaultysclaw/agent-controller start \
        -- headless \
        --name "$pj_agent" \
        --data-dir "$pj_data" \
        --peerjs "$PEERJS_PEER_ID" \
        --peerjs-server "$PEERJS_SERVER_URL_VAL" \
        > "$LOG_DIR/${pj_agent}.log" 2>&1 &
      PJ_PID=$!
      echo "$PJ_PID" >> "$PIDS_FILE"
      log "$pj_agent started (PID $PJ_PID) → $LOG_DIR/${pj_agent}.log"
      sleep 2
    done
  else
    warn "Could not get server DID — skipping PeerJS agents."
    warn "Start them manually:  pnpm agent:start -- headless --peerjs <peer-id> --peerjs-server http://127.0.0.1:${PEERJS_PORT:-9002}"
  fi
fi

# =============================================================================
# Summary
# =============================================================================

MINIO_LINE="  MinIO API:     http://127.0.0.1:${MINIO_API_PORT}   user: ${MINIO_ROOT_USER:-minioadmin}  pass: ${MINIO_ROOT_PASSWORD:-minioadmin123}"
MINIO_CON="  MinIO Console: http://127.0.0.1:${MINIO_CONSOLE_PORT}"
DOCLING_LINE="  Docling:       http://127.0.0.1:${DOCLING_PORT}"
PEERJS_LINE="  PeerJS:        http://127.0.0.1:${PEERJS_PORT:-9002}"

$SKIP_MINIO   && MINIO_LINE="  MinIO:         (skipped)"  && MINIO_CON=""
$SKIP_DOCLING && DOCLING_LINE="  Docling:       (skipped)"
$SKIP_PEERJS  && PEERJS_LINE="  PeerJS:        (skipped)"

echo
banner "╔══════════════════════════════════════════════════════════════╗"
banner "║      VaultysClaw Demo is running                            ║"
banner "╠══════════════════════════════════════════════════════════════╣"
echo   "║"
echo   "║  Control Plane:  ${CONTROL_PLANE_URL}"
echo   "║  WebSocket:      ${CONTROL_PLANE_WS_URL}"
echo   "║  Mission Ctrl:   ${CONTROL_PLANE_URL}/mission-control"
echo   "║"
[[ -n "$MINIO_LINE" ]] && echo "║ $MINIO_LINE"
[[ -n "$MINIO_CON"  ]] && echo "║ $MINIO_CON"
echo   "║ $DOCLING_LINE"
echo   "║ $PEERJS_LINE"
echo   "║"
echo   "║  PostgreSQL:     127.0.0.1:${PG_PORT}  db: ${PG_DB}"
echo   "║"
echo   "║  Logs:"
echo   "║    Control plane: $LOG_DIR/control-plane.log"
echo   "║    Simulator:     $LOG_DIR/simulator.log"
echo   "║"
echo   "║  Env file:  $ENV_FILE"
echo   "║"
banner "╠══════════════════════════════════════════════════════════════╣"
banner "║  Stop: Ctrl+C  — all processes & containers cleaned up      ║"
banner "╚══════════════════════════════════════════════════════════════╝"
echo

# Tail the simulator log so we see agent activity in the terminal
if ! $NO_SIMULATOR && [[ -f "$LOG_DIR/simulator.log" ]]; then
  log "Tailing simulator output (Ctrl+C to stop everything):"
  tail -f "$LOG_DIR/simulator.log" &
  TAIL_PID=$!
  echo "$TAIL_PID" >> "$PIDS_FILE"
fi

# Keep alive — trap handles cleanup on Ctrl+C
wait
