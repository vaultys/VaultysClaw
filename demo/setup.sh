#!/usr/bin/env bash
# =============================================================================
# VaultysClaw Demo Setup
#
# Starts the full demo stack:
#   - MinIO    (S3-compatible object storage)   http://localhost:9000  (API)
#                                               http://localhost:9001  (console)
#   - Docling  (document processing service)   http://localhost:5001
#   - Control Plane (Next.js + WebSocket)      http://localhost:3000
#   - research-agent  (internet_access)
#   - code-agent      (code_execution, file_access)
#   - report-agent    (file_access)
#
# Usage:
#   chmod +x demo/setup.sh
#   ./demo/setup.sh
#
# Flags:
#   --skip-minio     Don't start MinIO
#   --skip-docling   Don't start Docling
#
# Prerequisites:
#   - Docker installed and running
#   - pnpm installed
#   - Dependencies installed: pnpm install (from repo root)
#   - LLM API keys set in demo/agents/*/env files
#   - Control plane PostgreSQL configured in packages/control-plane/.env or .env.local
# =============================================================================

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEMO_DIR="$REPO_ROOT/demo"
CP_DIR="$REPO_ROOT/packages/control-plane"
CP_DATA_DIR="$DEMO_DIR/data"
AGENTS_BASE_DIR="$DEMO_DIR/agents"
WORKSPACE_DIR="$DEMO_DIR/workspace"
LOG_DIR="$DEMO_DIR/logs"
PIDS_FILE="$DEMO_DIR/.demo-pids"
DOCKER_CONTAINERS_FILE="$DEMO_DIR/.demo-docker-containers"

CONTROL_PLANE_URL="http://localhost:3000"
CONTROL_PLANE_WS="ws://localhost:8080"

# ── Docker service config ─────────────────────────────────────────────────────
MINIO_CONTAINER="vaultysclaw-demo-minio"
MINIO_PORT_API=9000
MINIO_PORT_CONSOLE=9001
MINIO_USER=minioadmin
MINIO_PASS=minioadmin
MINIO_BUCKET=demo-files

DOCLING_CONTAINER="vaultysclaw-demo-docling"
DOCLING_PORT=5001

# ── Flags ─────────────────────────────────────────────────────────────────────
SKIP_MINIO=false
SKIP_DOCLING=false
for arg in "$@"; do
  case "$arg" in
    --skip-minio)   SKIP_MINIO=true ;;
    --skip-docling) SKIP_DOCLING=true ;;
  esac
done

# ── Colours ───────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
BLUE='\033[0;34m'
NC='\033[0m'

log()  { echo -e "${GREEN}[demo]${NC} $*"; }
warn() { echo -e "${YELLOW}[demo]${NC} $*"; }
err()  { echo -e "${RED}[demo]${NC} $*" >&2; }
info() { echo -e "${BLUE}[demo]${NC} $*"; }

# ── Cleanup ───────────────────────────────────────────────────────────────────

cleanup() {
  log "Stopping demo agents and control plane..."
  if [[ -f "$PIDS_FILE" ]]; then
    while IFS= read -r pid; do
      [[ -n "$pid" ]] && kill "$pid" 2>/dev/null || true
    done < "$PIDS_FILE"
    rm -f "$PIDS_FILE"
  fi

  if [[ -f "$DOCKER_CONTAINERS_FILE" ]]; then
    log "Removing Docker containers..."
    while IFS= read -r cname; do
      [[ -n "$cname" ]] && docker rm -f "$cname" 2>/dev/null || true
    done < "$DOCKER_CONTAINERS_FILE"
    rm -f "$DOCKER_CONTAINERS_FILE"
  fi

  log "Done."
}

cleanup_existing() {
  log "Checking for existing demo processes..."
  # Kill any lingering tsx processes from demo agents (cli entry point)
  pkill -f "tsx.*agent-controller.*src/cli.ts" 2>/dev/null || true
  pkill -f "tsx/dist/cli.mjs src/cli.ts" 2>/dev/null || true
  # Kill any lingering control plane processes
  pkill -f "tsx.*control-plane.*server.ts" 2>/dev/null || true
  sleep 1
}

trap cleanup EXIT INT TERM

# ── Docker availability check ─────────────────────────────────────────────────

have_docker() { command -v docker &>/dev/null && docker info &>/dev/null 2>&1; }

# ── Docker service helpers ────────────────────────────────────────────────────

# wait_for_http <url> <label> <timeout_s>
wait_for_http() {
  local url="$1" label="$2" timeout="${3:-30}"
  for i in $(seq 1 "$timeout"); do
    if curl -sf "$url" >/dev/null 2>&1; then
      log "$label ready."
      return 0
    fi
    sleep 1
  done
  warn "$label did not respond within ${timeout}s — it may still be starting."
  return 0  # non-fatal: service might be slow but still usable
}

start_minio() {
  log "Starting MinIO (API :${MINIO_PORT_API}, console :${MINIO_PORT_CONSOLE})..."
  docker rm -f "$MINIO_CONTAINER" 2>/dev/null || true

  docker run -d \
    --name "$MINIO_CONTAINER" \
    -p "${MINIO_PORT_API}:9000" \
    -p "${MINIO_PORT_CONSOLE}:9001" \
    -e "MINIO_ROOT_USER=${MINIO_USER}" \
    -e "MINIO_ROOT_PASSWORD=${MINIO_PASS}" \
    minio/minio server /data --console-address ":9001" \
    > /dev/null

  echo "$MINIO_CONTAINER" >> "$DOCKER_CONTAINERS_FILE"
  wait_for_http "http://localhost:${MINIO_PORT_API}/minio/health/live" "MinIO" 30
}

start_docling() {
  # Docling is a large image (~3 GB) — pull is slow on first run.
  local image="quay.io/docling-project/docling-serve"

  # Check if the image is already cached to set expectations.
  if ! docker image inspect "$image" &>/dev/null 2>&1; then
    warn "Docling image not cached — first pull may take several minutes."
  fi

  log "Starting Docling (port :${DOCLING_PORT})..."
  docker rm -f "$DOCLING_CONTAINER" 2>/dev/null || true

  docker run -d \
    --name "$DOCLING_CONTAINER" \
    -p "${DOCLING_PORT}:5001" \
    "$image" \
    > /dev/null

  echo "$DOCLING_CONTAINER" >> "$DOCKER_CONTAINERS_FILE"
  # Docling takes longer to start; wait up to 120 s.
  wait_for_http "http://localhost:${DOCLING_PORT}/health" "Docling" 120
}

# ── Configure services in the control plane DB ────────────────────────────────

configure_services() {
  log "Configuring MinIO and Docling in the control-plane database..."

  # Resolve DATABASE_URL from the control-plane .env files (same search order as env-preload.ts)
  local db_url="${DATABASE_URL:-}"
  if [[ -z "$db_url" ]]; then
    for env_file in "$CP_DIR/.env.local" "$CP_DIR/.env" "$CP_DATA_DIR/.env"; do
      if [[ -f "$env_file" ]]; then
        local found
        found=$(grep -E "^DATABASE_URL=" "$env_file" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"' || true)
        if [[ -n "$found" ]]; then
          db_url="$found"
          break
        fi
      fi
    done
  fi

  if [[ -z "$db_url" ]]; then
    warn "DATABASE_URL not found — skipping service configuration."
    warn "Set it in packages/control-plane/.env or export it before running setup.sh."
    return
  fi

  local skip_minio_flag=""
  local skip_docling_flag=""
  $SKIP_MINIO   && skip_minio_flag="--skip-minio"
  $SKIP_DOCLING && skip_docling_flag="--skip-docling"

  # Run the configure script from the control-plane package directory so all
  # node_modules (aws-sdk, pg, @vaultys/id) resolve correctly.
  (
    cd "$CP_DIR"
    DATABASE_URL="$db_url" \
    pnpm exec tsx "$DEMO_DIR/configure-services.ts" \
      --minio-endpoint "http://localhost:${MINIO_PORT_API}" \
      --minio-bucket   "$MINIO_BUCKET" \
      --minio-user     "$MINIO_USER" \
      --minio-pass     "$MINIO_PASS" \
      --docling-url    "http://localhost:${DOCLING_PORT}" \
      ${skip_minio_flag} \
      ${skip_docling_flag} \
    2>&1 | sed "s/^/  /"
  ) || warn "Service configuration encountered errors (see output above)."
}

# ── Validate env files ────────────────────────────────────────────────────────

check_env_keys() {
  local agent_dir="$1"
  local env_file="$agent_dir/.env"
  if grep -q "your-openai-api-key-here\|your-anthropic-api-key-here" "$env_file" 2>/dev/null; then
    err "API key not set in $env_file"
    err "Edit the file and replace the placeholder with a real key."
    exit 1
  fi
}

# ── Start one agent ───────────────────────────────────────────────────────────

start_agent() {
  local name="$1"
  local agent_data_dir="$AGENTS_BASE_DIR/$name"
  local env_file="$agent_data_dir/.env"
  local log_file="$LOG_DIR/$name.log"

  log "Starting $name (data: $agent_data_dir)..."

  cd "$REPO_ROOT"
  (
    set -a
    # shellcheck disable=SC1090
    source "$env_file"
    set +a
    pnpm agent:start --name "$name" --data-dir "$agent_data_dir"
  ) > "$log_file" 2>&1 &
  local pid=$!
  echo "$pid" >> "$PIDS_FILE"
  log "$name started (PID $pid) — log: $log_file"

  # Small stagger to avoid registration race conditions
  sleep 2
}

# =============================================================================
# Main
# =============================================================================

# 0. Clean up leftover processes
cleanup_existing

# 1. Prepare directories
mkdir -p "$CP_DATA_DIR"
mkdir -p "$WORKSPACE_DIR" "$LOG_DIR"
mkdir -p "$AGENTS_BASE_DIR/research-agent/.vaultys"
mkdir -p "$AGENTS_BASE_DIR/code-agent/.vaultys"
mkdir -p "$AGENTS_BASE_DIR/report-agent/.vaultys"
> "$PIDS_FILE"
> "$DOCKER_CONTAINERS_FILE"

log "Control Plane data:  $CP_DATA_DIR"
log "Agents base dir:     $AGENTS_BASE_DIR"
log "Shared workspace:    $WORKSPACE_DIR"
log "Logs:                $LOG_DIR"

# 2. Validate agent API keys
log "Checking API key configuration..."
check_env_keys "$AGENTS_BASE_DIR/research-agent"
check_env_keys "$AGENTS_BASE_DIR/code-agent"
check_env_keys "$AGENTS_BASE_DIR/report-agent"

# 3. Start Docker services (MinIO, Docling)
if have_docker; then
  $SKIP_MINIO   || start_minio
  $SKIP_DOCLING || start_docling
else
  warn "Docker not available — skipping MinIO and Docling."
  SKIP_MINIO=true
  SKIP_DOCLING=true
fi

# 4. Start control plane
if curl -sf "$CONTROL_PLANE_URL/api/public/health" >/dev/null 2>&1; then
  warn "Control plane already running at $CONTROL_PLANE_URL — skipping start."
else
  log "Starting control plane (data: $CP_DATA_DIR)..."
  cd "$REPO_ROOT"
  pnpm --filter @vaultysclaw/control-plane dev -- --data-dir "$CP_DATA_DIR" \
    > "$LOG_DIR/control-plane.log" 2>&1 &
  echo $! >> "$PIDS_FILE"

  log "Waiting for control plane to be ready..."
  for i in $(seq 1 30); do
    if curl -sf "$CONTROL_PLANE_URL/api/public/health" >/dev/null 2>&1; then
      log "Control plane ready."
      break
    fi
    if [[ $i -eq 30 ]]; then
      err "Control plane did not start in 30 seconds."
      err "Check $LOG_DIR/control-plane.log for errors."
      exit 1
    fi
    sleep 1
  done
fi

# 5. Write MinIO / Docling settings into the control-plane DB
if ! $SKIP_MINIO || ! $SKIP_DOCLING; then
  configure_services
fi

# 6. Start the three demo agents
start_agent "research-agent"
start_agent "code-agent"
start_agent "report-agent"

# 7. Summary
MINIO_STATUS="${GREEN}running${NC}"
DOCLING_STATUS="${GREEN}running${NC}"
$SKIP_MINIO   && MINIO_STATUS="${YELLOW}skipped${NC}"
$SKIP_DOCLING && DOCLING_STATUS="${YELLOW}skipped${NC}"
! have_docker && MINIO_STATUS="${YELLOW}no docker${NC}" && DOCLING_STATUS="${YELLOW}no docker${NC}"

cat <<EOF

${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}
${GREEN}  VaultysClaw Demo is running${NC}

  Control Plane:      $CONTROL_PLANE_URL
  WebSocket:          $CONTROL_PLANE_WS

  MinIO API:          http://localhost:${MINIO_PORT_API}   — $(echo -e "$MINIO_STATUS")
  MinIO Console:      http://localhost:${MINIO_PORT_CONSOLE}  — $(echo -e "$MINIO_STATUS")
    user: ${MINIO_USER}   password: ${MINIO_PASS}
  Docling:            http://localhost:${DOCLING_PORT}  — $(echo -e "$DOCLING_STATUS")

  Agents (pending approval in the dashboard):
    • research-agent  — internet_access
    • code-agent      — code_execution, file_access
    • report-agent    — file_access

  ${YELLOW}Next step:${NC} Open ${CONTROL_PLANE_URL} and approve each agent
  in the Registrations panel, then assign the capabilities above.

  Logs:   $LOG_DIR/
  Stop:   Ctrl+C  (agents, control plane, and Docker containers are
          all cleaned up automatically)
${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}

EOF

# Keep script alive so the trap fires on Ctrl+C
wait
