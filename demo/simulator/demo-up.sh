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
#   --skip-inngest     Don't start Inngest (uses legacy in-process workflow engine)
#   --skip-obs         Don't start the Grafana observability stack
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
SKIP_INNGEST=false
SKIP_OBS=false
SKIP_SEED=false
NO_SIMULATOR=false
FRESH=false

for arg in "$@"; do
  case "$arg" in
    --skip-minio)    SKIP_MINIO=true ;;
    --skip-docling)  SKIP_DOCLING=true ;;
    --skip-litellm)  SKIP_LITELLM=true ;;
    --skip-inngest)  SKIP_INNGEST=true ;;
    --skip-obs)      SKIP_OBS=true ;;
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

  # STOP Docker containers in reverse startup order so dependents shut down
  # before Postgres (prevents data corruption on hard stops).
  for cname in "${OBS_GRAFANA_CONTAINER:-}" "${OBS_COLLECTOR_CONTAINER:-}" "${OBS_PROMETHEUS_CONTAINER:-}" "${OBS_TEMPO_CONTAINER:-}" \
               "${INNGEST_CONTAINER:-}" "${LITELLM_CONTAINER:-}" "${DOCLING_CONTAINER:-}" "${MINIO_CONTAINER:-}" "${PG_CONTAINER:-}"; do
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
    if docker exec "$PG_CONTAINER" pg_isready -h localhost -p 5432 -U "$user" -q 2>/dev/null; then
      log "PostgreSQL is ready."
      return 0
    fi
    sleep 1
  done
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
LITELLM_DB="vaultysclaw_litellm"

INNGEST_CONTAINER="vc-demo-inngest"
INNGEST_PORT="8288"
INNGEST_DEV_URL="http://127.0.0.1:${INNGEST_PORT}"   # control plane (host) → Inngest
WORKFLOW_ENGINE=$( $SKIP_INNGEST && echo "" || echo "inngest" )

OBS_NETWORK="vc-demo-obs"          # shared Docker bridge for all obs containers
OBS_COLLECTOR_CONTAINER="vc-demo-otel-collector"
OBS_TEMPO_CONTAINER="vc-demo-tempo"
OBS_PROMETHEUS_CONTAINER="vc-demo-prometheus"
OBS_GRAFANA_CONTAINER="vc-demo-grafana"
OBS_COLLECTOR_PORT="4318"    # OTLP/HTTP — control plane sends here (host → container)
OBS_TEMPO_HTTP_PORT="3200"   # Tempo query HTTP (host-mapped for debugging)
OBS_GRAFANA_PORT="3001"      # Grafana UI
OBS_PROMETHEUS_PORT="9090"   # Prometheus UI
OBS_CONFIG_DIR="$DEMO_DIR/observability"

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

# One-time migration: repair any NEXTAUTH_SECRET line written without the '=' separator
# (a previous version of this script had `printf 'NEXTAUTH_SECRET%s\n'` instead of
# `printf 'NEXTAUTH_SECRET=%s\n'`, which concatenated key + value into a single token).
if grep -qE '^NEXTAUTH_SECRET[^=]' "$ENV_FILE" 2>/dev/null; then
  warn "Repairing malformed NEXTAUTH_SECRET entry in $ENV_FILE (missing '=' separator)…"
  malformed_line=$(grep -E '^NEXTAUTH_SECRET[^=]' "$ENV_FILE" | head -1)
  fixed_value="${malformed_line#NEXTAUTH_SECRET}"
  # BSD sed (macOS) requires an explicit backup extension with -i
  sed -i.bak "s|^NEXTAUTH_SECRET[^=].*|NEXTAUTH_SECRET=${fixed_value}|" "$ENV_FILE" && rm -f "${ENV_FILE}.bak"
  log "Repaired NEXTAUTH_SECRET entry in $ENV_FILE"
fi

# Source secrets — use %%=* / #*= so values that contain '=' (e.g. base64 padding) are
# kept intact; the old IFS='=' read approach split on every '=' and silently dropped them.
while IFS= read -r _line; do
  _line="${_line%$'\r'}"
  [[ -z "$_line" || "$_line" == \#* ]] && continue
  _key="${_line%%=*}"
  _value="${_line#*=}"
  [[ -z "$_key" ]] && continue
  export "$_key"="$_value"
done < "$ENV_FILE"
unset _line _key _value

# Migrate older .env.demo files that predate LITELLM_MASTER_KEY
if [[ -z "${LITELLM_MASTER_KEY:-}" ]]; then
  LITELLM_MASTER_KEY="sk-demo-$(openssl rand -hex 16)"
  printf 'LITELLM_MASTER_KEY=%s\n' "$LITELLM_MASTER_KEY" >> "$ENV_FILE"
  log "Added LITELLM_MASTER_KEY to $ENV_FILE"
fi

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
  docker rm -f "${PG_CONTAINER}" "${MINIO_CONTAINER}" "${DOCLING_CONTAINER}" "${LITELLM_CONTAINER}" "${INNGEST_CONTAINER}" \
              "${OBS_COLLECTOR_CONTAINER}" "${OBS_TEMPO_CONTAINER}" "${OBS_PROMETHEUS_CONTAINER}" "${OBS_GRAFANA_CONTAINER}" \
              2>/dev/null || true
  docker volume rm "vc-demo-pgdata" "vc-demo-miniodata" \
                   "vc-demo-tempo-data" "vc-demo-prometheus-data" "vc-demo-grafana-data" \
                   2>/dev/null || true
  docker network rm "$OBS_NETWORK" 2>/dev/null || true
  rm -f "$ENV_FILE"
  rm -rf "$IDENTITIES_DIR" 2>/dev/null || true
  log "Wipe complete — env and identities will be regenerated."
fi

# =============================================================================
# Step 5 — Observability stack (Grafana LGTM — traces + metrics)
# =============================================================================

if ! $SKIP_OBS; then
  step "Observability"

  # All 4 obs containers share the vc-demo-obs Docker bridge network so they
  # can reach each other by container name (avoids host.docker.internal which
  # resolves to IPv6 on macOS/Docker Desktop, breaking gRPC from the Collector
  # to Tempo).  The OTel Collector still exposes ports to the host so the
  # control plane (a host process) can send OTLP to localhost:4318.

  log "Ensuring $OBS_NETWORK Docker network exists…"
  docker network create --driver bridge "$OBS_NETWORK" >/dev/null 2>&1 || true

  # Connect an existing container to the obs network if it isn't already.
  # Works on both running and stopped containers; silently no-ops if already connected.
  obs_connect_network() {
    local cname="$1"
    if ! docker inspect "$cname" \
         --format '{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}' \
         2>/dev/null | grep -qw "$OBS_NETWORK"; then
      log "Connecting $cname to $OBS_NETWORK network…"
      docker network connect "$OBS_NETWORK" "$cname" 2>/dev/null || true
    fi
  }

  # ── Tempo (trace storage) ──────────────────────────────────────────────────
  # Only the HTTP query port (3200) needs to be host-mapped — the OTLP gRPC
  # port (4317) is internal to the obs network; only the Collector reaches it.

  if docker inspect "$OBS_TEMPO_CONTAINER" &>/dev/null 2>&1; then
    obs_connect_network "$OBS_TEMPO_CONTAINER"
    if [[ "$(docker inspect -f '{{.State.Running}}' "$OBS_TEMPO_CONTAINER")" != "true" ]]; then
      log "Starting existing $OBS_TEMPO_CONTAINER"
      docker start "$OBS_TEMPO_CONTAINER" >/dev/null
    else
      log "$OBS_TEMPO_CONTAINER is already running."
    fi
  else
    log "Creating $OBS_TEMPO_CONTAINER (HTTP :${OBS_TEMPO_HTTP_PORT})…"
    docker run -d \
      --name "$OBS_TEMPO_CONTAINER" \
      --network "$OBS_NETWORK" \
      -p "${OBS_TEMPO_HTTP_PORT}:3200" \
      -v "${OBS_CONFIG_DIR}/tempo.yaml:/etc/tempo.yaml:ro" \
      -v "vc-demo-tempo-data:/var/tempo" \
      grafana/tempo:latest \
      -config.file=/etc/tempo.yaml \
      >/dev/null
  fi

  # ── Prometheus (metric storage) ───────────────────────────────────────────

  if docker inspect "$OBS_PROMETHEUS_CONTAINER" &>/dev/null 2>&1; then
    obs_connect_network "$OBS_PROMETHEUS_CONTAINER"
    if [[ "$(docker inspect -f '{{.State.Running}}' "$OBS_PROMETHEUS_CONTAINER")" != "true" ]]; then
      log "Starting existing $OBS_PROMETHEUS_CONTAINER"
      docker start "$OBS_PROMETHEUS_CONTAINER" >/dev/null
    else
      log "$OBS_PROMETHEUS_CONTAINER is already running."
    fi
  else
    log "Creating $OBS_PROMETHEUS_CONTAINER on port ${OBS_PROMETHEUS_PORT}…"
    docker run -d \
      --name "$OBS_PROMETHEUS_CONTAINER" \
      --network "$OBS_NETWORK" \
      -p "${OBS_PROMETHEUS_PORT}:9090" \
      -v "${OBS_CONFIG_DIR}/prometheus.yml:/etc/prometheus/prometheus.yml:ro" \
      -v "vc-demo-prometheus-data:/prometheus" \
      prom/prometheus:latest \
      --config.file=/etc/prometheus/prometheus.yml \
      --storage.tsdb.path=/prometheus \
      --web.enable-remote-write-receiver \
      >/dev/null
  fi

  # ── OTel Collector (ingestion gateway) ────────────────────────────────────
  # Stateless — safe to recreate if it's not on the obs network.
  # Exposes :4317 (gRPC) and :4318 (HTTP) to the host so the control plane
  # can send OTLP via localhost.  Internally it reaches Tempo and Prometheus
  # by container name over the obs network.

  OBS_COLLECTOR_NEEDS_CREATE=true
  if docker inspect "$OBS_COLLECTOR_CONTAINER" &>/dev/null 2>&1; then
    if ! docker inspect "$OBS_COLLECTOR_CONTAINER" \
         --format '{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}' \
         2>/dev/null | grep -qw "$OBS_NETWORK"; then
      warn "$OBS_COLLECTOR_CONTAINER is not on $OBS_NETWORK — recreating (stateless)."
      docker rm -f "$OBS_COLLECTOR_CONTAINER" >/dev/null 2>&1 || true
      # OBS_COLLECTOR_NEEDS_CREATE stays true
    else
      OBS_COLLECTOR_NEEDS_CREATE=false
      if [[ "$(docker inspect -f '{{.State.Running}}' "$OBS_COLLECTOR_CONTAINER")" != "true" ]]; then
        log "Starting existing $OBS_COLLECTOR_CONTAINER"
        docker start "$OBS_COLLECTOR_CONTAINER" >/dev/null
      else
        log "$OBS_COLLECTOR_CONTAINER is already running."
      fi
    fi
  fi

  if $OBS_COLLECTOR_NEEDS_CREATE; then
    log "Creating $OBS_COLLECTOR_CONTAINER (OTLP gRPC :4317 / HTTP :${OBS_COLLECTOR_PORT} → host)…"
    docker run -d \
      --name "$OBS_COLLECTOR_CONTAINER" \
      --network "$OBS_NETWORK" \
      -p "4317:4317" \
      -p "${OBS_COLLECTOR_PORT}:4318" \
      -v "${OBS_CONFIG_DIR}/otel-collector.yaml:/etc/otel-collector.yaml:ro" \
      otel/opentelemetry-collector-contrib:latest \
      --config /etc/otel-collector.yaml \
      >/dev/null
  fi

  # ── Grafana (visualisation) ────────────────────────────────────────────────

  if docker inspect "$OBS_GRAFANA_CONTAINER" &>/dev/null 2>&1; then
    obs_connect_network "$OBS_GRAFANA_CONTAINER"
    if [[ "$(docker inspect -f '{{.State.Running}}' "$OBS_GRAFANA_CONTAINER")" != "true" ]]; then
      log "Starting existing $OBS_GRAFANA_CONTAINER"
      docker start "$OBS_GRAFANA_CONTAINER" >/dev/null
    else
      log "$OBS_GRAFANA_CONTAINER is already running."
    fi
  else
    log "Creating $OBS_GRAFANA_CONTAINER on port ${OBS_GRAFANA_PORT}…"
    docker run -d \
      --name "$OBS_GRAFANA_CONTAINER" \
      --network "$OBS_NETWORK" \
      -p "${OBS_GRAFANA_PORT}:3000" \
      -v "vc-demo-grafana-data:/var/lib/grafana" \
      -v "${OBS_CONFIG_DIR}/grafana/provisioning:/etc/grafana/provisioning:ro" \
      -v "${OBS_CONFIG_DIR}/grafana/dashboards:/etc/grafana/dashboards:ro" \
      -e "GF_AUTH_ANONYMOUS_ENABLED=true" \
      -e "GF_AUTH_ANONYMOUS_ORG_ROLE=Admin" \
      -e "GF_AUTH_DISABLE_LOGIN_FORM=true" \
      -e "GF_FEATURE_TOGGLES_ENABLE=traceqlEditor traceToMetrics" \
      -e "GF_SERVER_ROOT_URL=http://localhost:${OBS_GRAFANA_PORT}" \
      grafana/grafana:latest \
      >/dev/null
  fi

  wait_http "http://127.0.0.1:${OBS_GRAFANA_PORT}/api/health" "Grafana" 60
  log "Grafana ready → http://localhost:${OBS_GRAFANA_PORT}  (anonymous admin, no login)"
fi

# =============================================================================
# Step 6 — PostgreSQL
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

# Ensure the dedicated LiteLLM database exists (separate from control plane DB)
log "Ensuring LiteLLM database '${LITELLM_DB}' exists…"
docker exec "$PG_CONTAINER" \
  env PGPASSWORD="$PG_PASSWORD" \
  psql -h localhost -U "$PG_USER" -d "$PG_DB" \
  -c "CREATE DATABASE \"${LITELLM_DB}\" OWNER \"${PG_USER}\";" \
  >/dev/null 2>&1 || true   # ignore "already exists" error

# =============================================================================
# Step 7 — MinIO
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
# Step 8 — Docling
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
# Step 9 — LiteLLM proxy
# =============================================================================

if ! $SKIP_LITELLM; then
  step "LiteLLM Proxy"

  # LiteLLM gets its own dedicated database so it never touches control plane data.
  # Rewrite 127.0.0.1 → host.docker.internal so the container can reach host Postgres.
  LITELLM_DB_URL="postgresql://${PG_USER}:${PG_PASSWORD}@host.docker.internal:${PG_PORT}/${LITELLM_DB}"

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
  database_url: "${LITELLM_DB_URL}"
  store_model_in_db: true

litellm_settings:
  # Drop unknown params so OpenAI-incompatible models don't error
  drop_params: true
  # Mask API keys in logs
  redact_messages_in_exceptions: true
LITELLMCFG

  # LiteLLM is stateless (all state in Postgres), so we can safely recreate it
  # whenever its baked-in env vars no longer match the current .env.demo values.
  # Without this check, an existing container started with docker-start replays
  # the old LITELLM_MASTER_KEY / DATABASE_URL and conflicts with the freshly
  # written YAML config → startup failure.
  LITELLM_NEEDS_CREATE=true
  if docker inspect "$LITELLM_CONTAINER" &>/dev/null 2>&1; then
    CONTAINER_MASTER_KEY=$(docker inspect "$LITELLM_CONTAINER" \
      --format '{{range .Config.Env}}{{println .}}{{end}}' \
      | grep '^LITELLM_MASTER_KEY=' | cut -d= -f2- | tr -d '\r\n')
    CONTAINER_DB_URL=$(docker inspect "$LITELLM_CONTAINER" \
      --format '{{range .Config.Env}}{{println .}}{{end}}' \
      | grep '^DATABASE_URL=' | cut -d= -f2- | tr -d '\r\n')

    if [[ "$CONTAINER_MASTER_KEY" == "$LITELLM_MASTER_KEY" && \
          "$CONTAINER_DB_URL"     == "$LITELLM_DB_URL"     ]]; then
      LITELLM_NEEDS_CREATE=false
      if [[ "$(docker inspect -f '{{.State.Running}}' "$LITELLM_CONTAINER")" != "true" ]]; then
        log "Starting existing $LITELLM_CONTAINER (config unchanged)."
        docker start "$LITELLM_CONTAINER" >/dev/null
      else
        log "$LITELLM_CONTAINER is already running with current config."
      fi
    else
      warn "LiteLLM env-var drift detected (master key or DB URL changed) — recreating container."
      docker rm -f "$LITELLM_CONTAINER" >/dev/null 2>&1 || true
    fi
  fi

  if $LITELLM_NEEDS_CREATE; then
    if ! docker image inspect "ghcr.io/berriai/litellm:main-latest" &>/dev/null 2>&1; then
      warn "LiteLLM image not cached — first pull may take a minute."
    fi
    log "Creating $LITELLM_CONTAINER on port ${LITELLM_PORT}…"
    docker run -d \
      --name "$LITELLM_CONTAINER" \
      -p "${LITELLM_PORT}:4000" \
      -v "${LITELLM_CONFIG_FILE}:/app/config.yaml:ro" \
      -e "LITELLM_MASTER_KEY=${LITELLM_MASTER_KEY}" \
      -e "DATABASE_URL=${LITELLM_DB_URL}" \
      --add-host "host.docker.internal:host-gateway" \
      ghcr.io/berriai/litellm:main-latest \
      --config /app/config.yaml \
      --port 4000 \
      >/dev/null
  fi

  wait_http "http://127.0.0.1:${LITELLM_PORT}/health/liveliness" "LiteLLM" 60
fi

# =============================================================================
# Step 10 — Prisma schema push (idempotent)
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
# Step 10b — Inngest (durable workflow engine)
# =============================================================================
# Stateless Dev Server: in-memory queue + state. It discovers the control plane's
# /api/inngest endpoint (the control plane runs as a host process, reached via
# host.docker.internal) and serves a dashboard at :8288. Started before the
# control plane — it polls until the endpoint responds, so order doesn't matter.

if ! $SKIP_INNGEST; then
  step "Inngest"

  if docker inspect "$INNGEST_CONTAINER" &>/dev/null 2>&1; then
    # Stateless — recreate to ensure the discovery URL/flags are current.
    docker rm -f "$INNGEST_CONTAINER" >/dev/null 2>&1 || true
  fi

  log "Creating $INNGEST_CONTAINER (dashboard :${INNGEST_PORT})…"
  docker run -d \
    --name "$INNGEST_CONTAINER" \
    -p "${INNGEST_PORT}:8288" \
    -e "INNGEST_DEV=1" \
    --add-host "host.docker.internal:host-gateway" \
    inngest/inngest:latest \
    inngest dev -u "http://host.docker.internal:${PORT}/api/inngest" \
    >/dev/null

  wait_http "http://127.0.0.1:${INNGEST_PORT}/" "Inngest Dev Server" 30
fi

# =============================================================================
# Step 11 — Control Plane
# =============================================================================
step "Control Plane"

# Capture what the env file had before we overwrite it — needed for drift detection below.
PREV_DB_URL=$(grep '^DATABASE_URL=' "$DATA_DIR/.env" 2>/dev/null | cut -d= -f2- | tr -d '\r\n')

# Always write the env file so it stays in sync with .env.demo credentials,
# even when the control plane is already running.  If credentials changed
# (e.g. after --fresh or .env.demo regen) the running process won't pick them
# up until restarted — but at least the file is correct for the next start and
# won't become a second source of truth that diverges from the DB password.
mkdir -p "$DATA_DIR"
OTEL_ENABLED=$( $SKIP_OBS && echo "false" || echo "true" )
OTEL_EXPORTER_OTLP_ENDPOINT="http://localhost:${OBS_COLLECTOR_PORT}"
OTEL_SERVICE_NAME="vaultysclaw-control-plane"

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
OTEL_ENABLED=${OTEL_ENABLED}
OTEL_EXPORTER_OTLP_ENDPOINT=${OTEL_EXPORTER_OTLP_ENDPOINT}
OTEL_SERVICE_NAME=${OTEL_SERVICE_NAME}
WORKFLOW_ENGINE=${WORKFLOW_ENGINE}
INNGEST_DEV=${INNGEST_DEV_URL}
CPENV

if curl -sf --max-time 2 "${CONTROL_PLANE_URL}/api/health" >/dev/null 2>&1; then
  # Detect if the running process was started with different Postgres credentials
  # (e.g. sync_postgres_password just reset the DB password to a new value).
  # We can't hot-reload env vars into a running Node process — warn so the
  # operator knows to restart the control plane if they see DB connection errors.
  if [[ -n "$PREV_DB_URL" && "$PREV_DB_URL" != "$DATABASE_URL" ]]; then
    warn "Control plane is running but its Postgres credentials have changed."
    warn "Restart the control plane to pick up the updated DATABASE_URL."
  else
    log "Control plane already running at ${CONTROL_PLANE_URL} — skipping start."
  fi
else
  log "Starting control plane…"

  # Raise file descriptor limit to prevent Watchpack EMFILE errors in dev mode.
  # Next.js watches thousands of files; the default macOS/Linux soft limit (256–1024)
  # is far too low. This applies only to child processes spawned from this point.
  ulimit -n 65536 2>/dev/null || true

  cd "$REPO_ROOT"
  DATABASE_URL="$DATABASE_URL" \
  NEXTAUTH_SECRET="$NEXTAUTH_SECRET" \
  NEXTAUTH_URL="$NEXTAUTH_URL" \
  NODE_ENV="$NODE_ENV" \
  PORT="$PORT" \
  WS_PORT="$WS_PORT" \
  LITELLM_BASE_URL="$LITELLM_BASE_URL" \
  LITELLM_MASTER_KEY="$LITELLM_MASTER_KEY" \
  OTEL_ENABLED="$OTEL_ENABLED" \
  OTEL_EXPORTER_OTLP_ENDPOINT="$OTEL_EXPORTER_OTLP_ENDPOINT" \
  OTEL_SERVICE_NAME="$OTEL_SERVICE_NAME" \
  WORKFLOW_ENGINE="$WORKFLOW_ENGINE" \
  INNGEST_DEV="$INNGEST_DEV_URL" \
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
# Step 12 — Claim ownership (first-time setup)
# =============================================================================

owner_exists_in_db() {
  local result
  result=$(docker exec "$PG_CONTAINER" \
    env PGPASSWORD="$PG_PASSWORD" \
    psql -h localhost -U "$PG_USER" -d "$PG_DB" -t -c \
    'SELECT COUNT(*) FROM "User" WHERE "isOwner" = true;' \
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
# Step 13 — Configure MinIO and Docling via REST API
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
# Step 14 — Demo seed
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
# Step 15 — Start simulator (30 fake agents)
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
INNGEST_LINE="  Inngest:       http://127.0.0.1:${INNGEST_PORT}   (durable workflow engine · runs · replay)"
GRAFANA_LINE="  Grafana:       http://127.0.0.1:${OBS_GRAFANA_PORT}  (traces · metrics · service map)"
PROM_LINE="  Prometheus:    http://127.0.0.1:${OBS_PROMETHEUS_PORT}"

$SKIP_MINIO   && MINIO_LINE="  MinIO:         (skipped)"  && MINIO_CON=""
$SKIP_DOCLING && DOCLING_LINE="  Docling:       (skipped)"
$SKIP_LITELLM && LITELLM_LINE="  LiteLLM:       (skipped)"
$SKIP_INNGEST && INNGEST_LINE="  Inngest:       (skipped — legacy in-process workflow engine)"
$SKIP_OBS     && GRAFANA_LINE="  Grafana:       (skipped)" && PROM_LINE=""

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
echo   "║ $INNGEST_LINE"
echo   "║ $GRAFANA_LINE"
[[ -n "$PROM_LINE" ]] && echo "║ $PROM_LINE"
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
