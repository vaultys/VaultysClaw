#!/usr/bin/env bash
# =============================================================================
# VaultysClaw Demo Setup
#
# Starts the control plane and three pre-configured demo agents:
#   - research-agent  (internet_access)
#   - code-agent      (code_execution, file_access)
#   - report-agent    (file_access)
#
# Usage:
#   chmod +x demo/setup.sh
#   ./demo/setup.sh
#
# Prerequisites:
#   - pnpm installed
#   - Dependencies installed: pnpm install (from repo root)
#   - LLM API keys set in demo/agents/*/env files
#   - Control plane env configured in packages/control-plane/.env.local
#     (copy from .env.example and set CONTROL_PLANE_PORT=3300)
# =============================================================================

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEMO_DIR="$REPO_ROOT/demo"
WORKSPACE_DIR="$DEMO_DIR/workspace"
LOG_DIR="$DEMO_DIR/logs"
PIDS_FILE="$DEMO_DIR/.demo-pids"

CONTROL_PLANE_URL="http://localhost:3000"
CONTROL_PLANE_WS="ws://localhost:8080"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

log()  { echo -e "${GREEN}[demo]${NC} $*"; }
warn() { echo -e "${YELLOW}[demo]${NC} $*"; }
err()  { echo -e "${RED}[demo]${NC} $*" >&2; }

cleanup() {
  log "Stopping demo agents and control plane..."
  if [[ -f "$PIDS_FILE" ]]; then
    while IFS= read -r pid; do
      [[ -n "$pid" ]] && kill "$pid" 2>/dev/null || true
    done < "$PIDS_FILE"
    rm -f "$PIDS_FILE"
  fi
  log "Done."
}

cleanup_existing() {
  log "Checking for existing demo processes..."
  # Kill any lingering tsx processes from demo agents (look for src/index.ts in agent-controller)
  pkill -f "tsx.*agent-controller.*src/index.ts" 2>/dev/null || true
  # Kill any lingering control plane processes (look for tsx server.ts in control-plane)
  pkill -f "tsx.*control-plane.*server.ts" 2>/dev/null || true
}

trap cleanup EXIT INT TERM

# ---------------------------------------------------------------------------
# 0. Validate env files have real API keys
# ---------------------------------------------------------------------------
check_env_keys() {
  local agent_dir="$1"
  local env_file="$agent_dir/.env"
  if grep -q "your-openai-api-key-here\|your-anthropic-api-key-here" "$env_file" 2>/dev/null; then
    err "API key not set in $env_file"
    err "Edit the file and replace the placeholder with a real key."
    exit 1
  fi
}

# ---------------------------------------------------------------------------
# 0. Clean up any existing demo processes
# ---------------------------------------------------------------------------
cleanup_existing

# ---------------------------------------------------------------------------
# 1. Prepare directories
# ---------------------------------------------------------------------------
mkdir -p "$WORKSPACE_DIR" "$LOG_DIR"
mkdir -p "$DEMO_DIR/agents/research-agent/.vaultys"
mkdir -p "$DEMO_DIR/agents/code-agent/.vaultys"
mkdir -p "$DEMO_DIR/agents/report-agent/.vaultys"
> "$PIDS_FILE"

log "Workspace:  $WORKSPACE_DIR"
log "Logs:       $LOG_DIR"

# ---------------------------------------------------------------------------
# 2. Validate API keys
# ---------------------------------------------------------------------------
log "Checking API key configuration..."
check_env_keys "$DEMO_DIR/agents/research-agent"
check_env_keys "$DEMO_DIR/agents/code-agent"
check_env_keys "$DEMO_DIR/agents/report-agent"

# ---------------------------------------------------------------------------
# 3. Start control plane (if not already running)
# ---------------------------------------------------------------------------
if curl -sf "$CONTROL_PLANE_URL/api/health" >/dev/null 2>&1; then
  warn "Control plane already running at $CONTROL_PLANE_URL — skipping start."
else
  log "Starting control plane..."
  cd "$REPO_ROOT"
  pnpm vaultysclaw:dev \
    > "$LOG_DIR/control-plane.log" 2>&1 &
  echo $! >> "$PIDS_FILE"

  log "Waiting for control plane to be ready..."
  for i in $(seq 1 30); do
    if curl -sf "$CONTROL_PLANE_URL/api/health" >/dev/null 2>&1; then
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

# ---------------------------------------------------------------------------
# 4. Helper: start one agent
# ---------------------------------------------------------------------------
start_agent() {
  local name="$1"
  local env_file="$DEMO_DIR/agents/$name/.env"
  local log_file="$LOG_DIR/$name.log"

  log "Starting $name..."

  # Export env vars from the agent's .env file
  set -a
  # shellcheck disable=SC1090
  source "$env_file"
  set +a

  cd "$REPO_ROOT"
  pnpm agent:start \
    > "$log_file" 2>&1 &
  local pid=$!
  echo "$pid" >> "$PIDS_FILE"
  log "$name started (PID $pid) — log: $log_file"

  # Small stagger to avoid registration race conditions
  sleep 2
}

# ---------------------------------------------------------------------------
# 5. Start the three demo agents
# ---------------------------------------------------------------------------
start_agent "research-agent"
start_agent "code-agent"
start_agent "report-agent"

# ---------------------------------------------------------------------------
# 6. Summary
# ---------------------------------------------------------------------------
cat <<EOF

${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}
${GREEN}  VaultysClaw Demo is running${NC}

  Control Plane:    $CONTROL_PLANE_URL
  WebSocket:        $CONTROL_PLANE_WS

  Agents (pending approval in the dashboard):
    • research-agent  — internet_access
    • code-agent      — code_execution, file_access
    • report-agent    — file_access

  ${YELLOW}Next step:${NC} Open ${CONTROL_PLANE_URL} and approve each agent
  in the Registrations panel, then assign the capabilities above.

  Logs:   $LOG_DIR/
  Stop:   Ctrl+C (or kill the PIDs in $PIDS_FILE)
${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}

EOF

# Keep script alive so trap fires on Ctrl+C
wait
