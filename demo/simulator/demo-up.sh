#!/usr/bin/env bash
# =============================================================================
# demo/demo-up.sh — VaultysClaw full demo environment
#
# Sandboxes ALL environment variables, creates dedicated Docker containers
# for PostgreSQL, MinIO, Docling and LiteLLM, then starts the control plane
# and the 30-agent simulator.  Nothing touches your existing .env files.
#
# Usage:
#   chmod +x demo/simulator/demo-up.sh
#   ./demo/simulator/demo-up.sh [flags]
#
# Flags:
#   --skip-minio       Don't start MinIO  (uses filesystem storage instead)
#   --skip-docling     Don't start Docling
#   --skip-litellm     Don't start LiteLLM proxy
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
SKIP_LITELLM=false
SKIP_SEED=false
NO_SIMULATOR=false
FRESH=false

for arg in "$@"; do
  case "$arg" in
    --skip-minio)    SKIP_MINIO=true ;;
    --skip-docling)  SKIP_DOCLING=true ;;
    --skip-litellm)  SKIP_LITELLM=true ;;
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

  # Kill Node.js processes (control plane, simulator)
  if [[ -f "$PIDS_FILE" ]]; then
    while IFS= read -r pid; do
      [[ -n "$pid" ]] && kill "$pid" 2>/dev/null || true
    done < "$PIDS_FILE"
    rm -f "$PIDS_FILE"
  fi

  # STOP Docker containers (preserves volumes & data for next run).
  for cname in "${PG_CONTAINER:-}" "${MINIO_CONTAINER:-}" "${DOCLING_CONTAINER:-}" "${LITELLM_CONTAINER:-}"; do
    [[ -z "$cname" ]] && continue
    if docker inspect "$cname" &>/dev/null 2>&1; then
      docker stop "$cname" >/dev/null 2>&1 || true
      log "Stopped container $cname (data preserved — use --fresh to wipe)"
    fi
  done

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
  if docker exec "$PG_CONTAINER" pg_isready -U "$PG_USER" -q 2>/dev/null; then
    log "PostgreSQL is ready (via docker exec)."
    return 0
  fi
  warn "PostgreSQL did not respond within ${secs}s — continuing anyway."
}

# ── Sync PostgreSQL password ──────────────────────────────────────────────────

sync_postgres_password() {
  if docker exec "$PG_CONTAINER" \
       env PGPASSWORD="$PG_PASSWORD" \
       psql -h localhost -U "$PG_USER" -d "$PG_DB" -c "SELECT 1;" \
       >/dev/null 2>&1; then
    return 0
  fi

  warn "PostgreSQL password mismatch (volume has an old password)."
  warn "Resetting password for user '${PG_USER}' via superuser socket…"

  if docker exec --user postgres "$PG_CONTAINER" \
       psql -c "ALTER USER \"${PG_USER}\" WITH PASSWORD '${PG_PASSWORD}';" \
       >/dev/null 2>&1; then
    log "Password reset ✓"
  else
    docker exec "$PG_CONTAINER" \
      psql -U postgres \
      -c "ALTER USER \"${PG_USER}\" WITH PASSWORD '${PG_PASSWORD}';" \
      >/dev/null 2>&1 || true
  fi

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
# Step 2 — Fixed operational constants
# =============================================================================

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

LITELLM_CONTAINER="vc-demo-litellm"
LITELLM_PORT="4000"
LITELLM_BASE_URL="http://127.0.0.1:${LITELLM_PORT}"

NODE_ENV="development"
PORT="3000"
WS_PORT="8080"
NEXTAUTH_URL="http://localhost:3000"
CONTROL_PLANE_URL="http://localhost:3000"
CONTROL_PLANE_WS_URL="ws://localhost:8080"

# =============================================================================
# Step 3 — Generated secrets
# =============================================================================
step "Environment"

mkdir -p "$DATA_DIR" "$LOG_DIR"
> "$PIDS_FILE"
> "$DOCKER_CONTAINERS_FILE"

if [[ ! -f "$ENV_FILE" ]]; then
  log "Generating demo secrets → $ENV_FILE"

  NEXTAUTH_SECRET_GEN=$(openssl rand -base64 32)
  PG_PASSWORD_GEN=$(openssl rand -hex 16)
  LITELLM_MASTER_KEY_GEN="sk-demo-$(openssl rand -hex 16)"

  printf '# VaultysClaw Demo Secrets\n'                          > "$ENV_FILE"
  printf '# Generated: %s\n' "$(date -u +"%Y-%m-%d %H:%M UTC")" >> "$ENV_FILE"
  printf '# These are the ONLY values that change per deployment.\n\n' >> "$ENV_FILE"
  printf 'PG_PASSWORD=%s\n' "$PG_PASSWORD_GEN"                   >> "$ENV_FILE"
  printf 'DATABASE_URL=postgresql://%s:%s@127.0.0.1:%s/%s\n' \
    "$PG_USER" "$PG_PASSWORD_GEN" "$PG_PORT" "$PG_DB"            >> "$ENV_FILE"
  printf 'NEXTAUTH_SECRET=%s\n' "$NEXTAUTH_SECRET_GEN"           >> "$ENV_FILE"
  printf 'LITELLM_MASTER_KEY=%s\n' "$LITELLM_MASTER_KEY_GEN"     >> "$ENV_FILE"

  log "Created $ENV_FILE"
else
  log "Re-using existing $ENV_FILE"
fi

# Source secrets
while IFS='=' read -r key value; do
  [[ -z "$key" || "$key" == \#* ]] && continue
  key="${key%$'\r'}"
  value="${value%$'\r'}"
  export "$key"="$value"
done < "$ENV_FILE"

export DATABASE_URL NEXTAUTH_SECRET LITELLM_MASTER_KEY
export NODE_ENV PORT WS_PORT NEXTAUTH_URL

log "Environment loaded:"
log "  DATABASE_URL      = ${DATABASE_URL}"
log "  NEXTAUTH_URL      = ${NEXTAUTH_URL}"
log "  Control Plane URL = ${CONTROL_PLANE_URL}"
log "  WS URL            = ${CONTROL_PLANE_WS_URL}"
log "  LiteLLM URL       = ${LITELLM_BASE_URL}"

# =============================================================================
# Step 4 — Fresh wipe (if --fresh)
# =============================================================================

if $FRESH; then
  step "Fresh wipe"
  warn "Wiping demo containers and volumes (--fresh)…"
  docker rm -f "${PG_CONTAINER}" "${MINIO_CONTAINER}" "${DOCLING_CONTAINER}" "${LITELLM_CONTAINER}" 2>/dev/null || true
  docker volume rm "vc-demo-pgdata" "vc-demo-miniodata" 2>/dev/null || true
  rm -f "$ENV_FILE"
  rm -rf "$IDENTITIES_DIR" 2>/dev/null || true
  log "Wipe complete — env and identities will be regenerated."
fi

# =============================================================================
# Step 5 — PostgreSQL
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
# Step 6 — MinIO
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

  log "Ensuring bucket '${MINIO_BUCKET}' exists…"
  docker exec "$MINIO_CONTAINER" sh -c "
    mc alias set local http://localhost:9000 '${MINIO_ROOT_USER}' '${MINIO_ROOT_PASSWORD}' --quiet 2>/dev/null || true
    mc mb --ignore-existing local/${MINIO_BUCKET} 2>/dev/null || true
    echo 'Bucket OK'
  " 2>/dev/null && log "Bucket '${MINIO_BUCKET}' ready." || warn "Could not verify bucket — configure manually in Settings > Storage."
fi

# =============================================================================
# Step 7 — Docling
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

  wait_http "http://127.0.0.1:${DOCLING_PORT}/health" "Docling" 120
fi

# =============================================================================
# Step 8 — LiteLLM proxy
# =============================================================================

if ! $SKIP_LITELLM; then
  step "LiteLLM Proxy"

  # Write a minimal config file so LiteLLM starts cleanly.
  # Models are registered dynamically via the control plane UI / API;
  # the config only sets global defaults and the master key.
  LITELLM_CONFIG_FILE="$DATA_DIR/litellm_config.yaml"
  mkdir -p "$DATA_DIR"
  cat > "$LITELLM_CONFIG_FILE" <<LITELLMCFG
# LiteLLM proxy config — managed by demo-up.sh
# Add provider API keys here or in the control plane UI.
# Models are registered dynamically; no static model_list needed.
general_settings:
  master_key: "${LITELLM_MASTER_KEY}"
  # Store spend and key data in the same Postgres as the control plane
  database_url: "${DATABASE_URL}"
  store_model_in_db: true

litellm_settings:
  # Drop unknown params so OpenAI-incompatible models don't error
  drop_params: true
  # Mask API keys in logs
  redact_messages_in_exceptions: true
LITELLMCFG

  if docker inspect "$LITELLM_CONTAINER" &>/dev/null 2>&1; then
    if [[ "$(docker inspect -f '{{.State.Running}}' "$LITELLM_CONTAINER")" != "true" ]]; then
      log "Starting existing $LITELLM_CONTAINER"
      docker start "$LITELLM_CONTAINER" >/dev/null
    else
      log "$LITELLM_CONTAINER is already running."
    fi
  else
    if ! docker image inspect "ghcr.io/berriai/litellm:main-latest" &>/dev/null 2>&1; then
      warn "LiteLLM image not cached — first pull may take a minute."
    fi
    log "Creating $LITELLM_CONTAINER on port ${LITELLM_PORT}…"
    docker run -d \
      --name "$LITELLM_CONTAINER" \
      -p "${LITELLM_PORT}:4000" \
      -v "${LITELLM_CONFIG_FILE}:/app/config.yaml:ro" \
      -e "LITELLM_MASTER_KEY=${LITELLM_MASTER_KEY}" \
      -e "DATABASE_URL=${DATABASE_URL}" \
      --add-host "host.docker.internal:host-gateway" \
      ghcr.io/berriai/litellm:main-latest \
      --config /app/config.yaml \
      --port 4000 \
      >/dev/null
  fi

  wait_http "http://127.0.0.1:${LITELLM_PORT}/health/liveliness" "LiteLLM" 60
fi

# =============================================================================
# Step 9 — Prisma schema push (idempotent)
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
# Step 10 — Control Plane
# =============================================================================
step "Control Plane"

if curl -sf --max-time 2 "${CONTROL_PLANE_URL}/api/health" >/dev/null 2>&1; then
  log "Control plane already running at ${CONTROL_PLANE_URL} — skipping start."
else
  log "Starting control plane…"

  mkdir -p "$DATA_DIR"
  cat > "$DATA_DIR/.env" <<CPENV
# Generated by demo-up.sh — do not edit manually
DATABASE_URL=${DATABASE_URL}
NEXTAUTH_URL=${NEXTAUTH_URL}
NEXTAUTH_SECRET=${NEXTAUTH_SECRET}
NODE_ENV=${NODE_ENV}
PORT=${PORT}
WS_PORT=${WS_PORT}
LITELLM_BASE_URL=${LITELLM_BASE_URL}
LITELLM_MASTER_KEY=${LITELLM_MASTER_KEY}
CPENV

  cd "$REPO_ROOT"
  DATABASE_URL="$DATABASE_URL" \
  NEXTAUTH_SECRET="$NEXTAUTH_SECRET" \
  NEXTAUTH_URL="$NEXTAUTH_URL" \
  NODE_ENV="$NODE_ENV" \
  PORT="$PORT" \
  WS_PORT="$WS_PORT" \
  LITELLM_BASE_URL="$LITELLM_BASE_URL" \
  LITELLM_MASTER_KEY="$LITELLM_MASTER_KEY" \
  pnpm --filter @vaultysclaw/control-plane dev -- --data-dir "$DATA_DIR" \
    > "$LOG_DIR/control-plane.log" 2>&1 &
  CP_PID=$!
  echo "$CP_PID" >> "$PIDS_FILE"
  log "Control plane started (PID $CP_PID) → $LOG_DIR/control-plane.log"

  log "Waiting for control plane to be ready (this takes ~20-30s on first run)…"
  wait_http "${CONTROL_PLANE_URL}/api/health" "Control Plane" 90

  if ! curl -sf --max-time 2 "${CONTROL_PLANE_URL}/api/health" >/dev/null 2>&1; then
    warn "Control plane may not be fully ready. Last log lines:"
    tail -20 "$LOG_DIR/control-plane.log" | sed 's/^/    /'
  fi
fi

# =============================================================================
# Step 11 — Claim ownership (first-time setup)
# =============================================================================

owner_exists_in_db() {
  local result
  result=$(docker exec "$PG_CONTAINER" \
    psql -U "$PG_USER" -d "$PG_DB" -t -c \
    "SELECT COUNT(*) FROM users WHERE is_owner = true;" \
    2>/dev/null | tr -d ' \n')
  [[ "$result" == "1" || "$result" -gt 0 ]] 2>/dev/null && echo "yes" || echo "no"
}

NEEDS_OWNER_PROMPT=false
if $FRESH; then
  NEEDS_OWNER_PROMPT=true
elif [[ "$(owner_exists_in_db)" != "yes" ]]; then
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
# Step 12 — Configure MinIO and Docling via REST API
# =============================================================================
step "Service configuration"

API_KEY="${DEMO_API_KEY:-vc-demo-0000-0000-0000-000000000001}"

configure_storage() {
  log "Configuring MinIO / S3 storage…"
  local payload
  payload=$(printf '{"storageType":"s3","s3":{"enabled":true,"region":"%s","bucket":"%s","endpoint":"http://127.0.0.1:%s","accessKeyId":"%s","secretAccessKey":"%s"}}' \
    "${MINIO_REGION:-us-east-1}" "${MINIO_BUCKET:-vc-demo-files}" "${MINIO_API_PORT:-9000}" \
    "${MINIO_ROOT_USER:-minioadmin}" "${MINIO_ROOT_PASSWORD:-minioadmin123}")

  local status=""
  status=$(curl -s -o /dev/null -w "%{http_code}" \
    -X PUT "${CONTROL_PLANE_URL}/api/settings/storage" \
    -H "Content-Type: application/json" \
    -H "x-api-key: ${API_KEY}" \
    -d "$payload" 2>/dev/null) || true

  if [[ "$status" == "200" ]]; then
    log "MinIO storage configured (bucket: ${MINIO_BUCKET:-vc-demo-files} @ port ${MINIO_API_PORT:-9000})."
  else
    warn "Storage configuration returned HTTP ${status:-unreachable}."
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
  else
    warn "Docling configuration returned HTTP ${status:-unreachable}."
    warn "Configure manually: Settings → Docling → URL = http://127.0.0.1:${DOCLING_PORT:-5001}"
  fi
}

# =============================================================================
# Step 13 — Demo seed
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

# Configure services after seed (API key exists after seed)
$SKIP_MINIO   || configure_storage
$SKIP_DOCLING || configure_docling

# =============================================================================
# Step 14 — Start simulator (30 fake agents)
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

  sleep 5
fi

# =============================================================================
# Summary
# =============================================================================

MINIO_LINE="  MinIO API:     http://127.0.0.1:${MINIO_API_PORT}   user: ${MINIO_ROOT_USER:-minioadmin}  pass: ${MINIO_ROOT_PASSWORD:-minioadmin123}"
MINIO_CON="  MinIO Console: http://127.0.0.1:${MINIO_CONSOLE_PORT}"
DOCLING_LINE="  Docling:       http://127.0.0.1:${DOCLING_PORT}"
LITELLM_LINE="  LiteLLM:       http://127.0.0.1:${LITELLM_PORT}   key: ${LITELLM_MASTER_KEY:0:16}…"

$SKIP_MINIO   && MINIO_LINE="  MinIO:         (skipped)"  && MINIO_CON=""
$SKIP_DOCLING && DOCLING_LINE="  Docling:       (skipped)"
$SKIP_LITELLM && LITELLM_LINE="  LiteLLM:       (skipped)"

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
echo   "║ $LITELLM_LINE"
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

# Tail simulator log so we see agent activity in the terminal
if ! $NO_SIMULATOR && [[ -f "$LOG_DIR/simulator.log" ]]; then
  log "Tailing simulator output (Ctrl+C to stop everything):"
  tail -f "$LOG_DIR/simulator.log" &
  TAIL_PID=$!
  echo "$TAIL_PID" >> "$PIDS_FILE"
fi

# Keep alive — trap handles cleanup on Ctrl+C
wait
