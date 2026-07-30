#!/usr/bin/env bash
# quickstart.sh — One-command local bootstrap for vaultysclaw-sensor.
#
# Builds both binaries, generates a real VaultysId for each of the sensor
# and the collector, writes minimal configs, and starts the standalone
# reference collector + the sensor daemon against each other on localhost.
# The sensor connects the same way a real VaultysClaw agent would — a
# register → challenge → approval → connected handshake — so on first run
# it lands in "pending approval" until approved (auto-approved here by
# default, since it's your own two local processes; see --no-auto-approve).
# Everything this script creates lives under .quickstart/ (next to this
# script) so it's fully self-contained and safe to delete/re-run.
#
# Usage:
#   ./quickstart.sh                  # build, configure, and run (foreground)
#   ./quickstart.sh --no-auto-approve  # leave the sensor pending; approve it yourself
#   ./quickstart.sh --rotate         # forget existing identities/state and start fresh
#
# Stop with Ctrl+C — both processes are cleaned up automatically.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DATA_DIR="$SCRIPT_DIR/.quickstart"
BIN_DIR="$DATA_DIR/bin"
LOG_DIR="$DATA_DIR/logs"
PIDS_FILE="$DATA_DIR/.quickstart-pids"

COLLECTOR_CONFIG="$DATA_DIR/collector-config.yaml"
SENSOR_CONFIG="$DATA_DIR/sensor-config.yaml"
SENSOR_IDENTITY_FILE="$DATA_DIR/sensor-identity.secret"
COLLECTOR_IDENTITY_FILE="$DATA_DIR/collector-identity.secret"
SNAPSHOT_FILE="$DATA_DIR/collector-state.json"

COLLECTOR_PORT=18443
COLLECTOR_URL="http://127.0.0.1:${COLLECTOR_PORT}"

# ── Colours ──────────────────────────────────────────────────────────────────
# ANSI-C quoting ($'...') so these hold the real escape byte, not literal
# backslash text — that way they render correctly both via `echo -e` and
# inside the plain heredoc used for the summary below.
GREEN=$'\033[0;32m'
YELLOW=$'\033[1;33m'
RED=$'\033[0;31m'
CYAN=$'\033[0;36m'
NC=$'\033[0m'

log()  { echo -e "${GREEN}[quickstart]${NC} $*"; }
warn() { echo -e "${YELLOW}[quickstart]${NC} $*"; }
err()  { echo -e "${RED}[quickstart]${NC} $*" >&2; }

# ── Flags ────────────────────────────────────────────────────────────────────
ROTATE=false
AUTO_APPROVE=true
for arg in "$@"; do
  case "$arg" in
    --rotate) ROTATE=true ;;
    --no-auto-approve) AUTO_APPROVE=false ;;
    *) err "unknown flag: $arg"; exit 1 ;;
  esac
done

# ── Cleanup ──────────────────────────────────────────────────────────────────
cleanup() {
  log "Stopping sensor and collector..."
  if [[ -f "$PIDS_FILE" ]]; then
    while IFS= read -r pid; do
      [[ -n "$pid" ]] && kill "$pid" 2>/dev/null || true
    done < "$PIDS_FILE"
    rm -f "$PIDS_FILE"
  fi
  log "Done."
}
trap cleanup EXIT INT TERM

# ── Prerequisites ────────────────────────────────────────────────────────────
if ! command -v go &>/dev/null; then
  err "Go is required but was not found on PATH. Install it from https://go.dev/dl/ and try again."
  exit 1
fi

mkdir -p "$BIN_DIR" "$LOG_DIR"

if $ROTATE; then
  warn "Rotating: removing existing identities and collector state."
  rm -f "$SENSOR_IDENTITY_FILE" "$COLLECTOR_IDENTITY_FILE" "$SNAPSHOT_FILE" "$COLLECTOR_CONFIG" "$SENSOR_CONFIG"
fi

# ── Build ────────────────────────────────────────────────────────────────────
log "Building sensor and collector binaries..."
( cd "$SCRIPT_DIR" && go build -o "$BIN_DIR/vaultysclaw-sensor" ./cmd/sensor )
( cd "$SCRIPT_DIR" && go build -o "$BIN_DIR/vaultysclaw-collector" ./cmd/collector )

# ── Configs (written once; re-running reuses them so identities stay
#    stable and previously-approved DIDs don't need re-approval) ────────────
if [[ ! -f "$COLLECTOR_CONFIG" ]]; then
  cat > "$COLLECTOR_CONFIG" <<EOF
listenAddr: "127.0.0.1:${COLLECTOR_PORT}"
snapshotPath: "${SNAPSHOT_FILE}"
snapshotIntervalSeconds: 30
identityPath: "${COLLECTOR_IDENTITY_FILE}"
debug: false
EOF
fi

if [[ ! -f "$SENSOR_CONFIG" ]]; then
  cat > "$SENSOR_CONFIG" <<EOF
collectorUrl: "${COLLECTOR_URL}"
deviceName: "$(hostname)"
scanIntervalSeconds: 30
telemetryEnabled: true
debug: false
identityPath: "${SENSOR_IDENTITY_FILE}"
EOF
fi

# ── Start collector ──────────────────────────────────────────────────────────
log "Starting reference collector on ${COLLECTOR_URL} ..."
"$BIN_DIR/vaultysclaw-collector" run --config "$COLLECTOR_CONFIG" \
  > "$LOG_DIR/collector.log" 2>&1 &
echo $! >> "$PIDS_FILE"

log "Waiting for collector to be ready..."
for i in $(seq 1 15); do
  if curl -sf "${COLLECTOR_URL}/v1/devices" >/dev/null 2>&1; then
    log "Collector ready."
    break
  fi
  if [[ $i -eq 15 ]]; then
    err "Collector did not start in time. Check $LOG_DIR/collector.log for errors."
    exit 1
  fi
  sleep 1
done

# ── Start sensor ─────────────────────────────────────────────────────────────
log "Starting sensor daemon (scanning every 30s)..."
"$BIN_DIR/vaultysclaw-sensor" run --config "$SENSOR_CONFIG" \
  > "$LOG_DIR/sensor.log" 2>&1 &
echo $! >> "$PIDS_FILE"

# ── Wait for the sensor's connection to reach the collector, then either
#    auto-approve it (default) or leave it pending for you to approve ──────
log "Waiting for the sensor's connection to reach the collector..."
SENSOR_DID=""
for i in $(seq 1 15); do
  SENSOR_DID="$(curl -sf "${COLLECTOR_URL}/v1/pending" 2>/dev/null | grep -o '"did":"[^"]*"' | head -1 | cut -d'"' -f4 || true)"
  if [[ -n "$SENSOR_DID" ]]; then
    break
  fi
  # Already known from a previous run (re-approval not needed)?
  if curl -sf "${COLLECTOR_URL}/v1/devices" 2>/dev/null | grep -q '"id"'; then
    break
  fi
  sleep 1
done

if [[ -n "$SENSOR_DID" ]]; then
  log "Sensor connected as ${SENSOR_DID}, awaiting approval."
  if $AUTO_APPROVE; then
    curl -sf -X POST "${COLLECTOR_URL}/v1/pending/${SENSOR_DID}/approve" >/dev/null
    log "Auto-approved (this is your own local sensor — in production, an operator clicks Approve on the dashboard)."
  else
    warn "Not auto-approved. Approve it yourself:"
    warn "  curl -X POST ${COLLECTOR_URL}/v1/pending/${SENSOR_DID}/approve"
  fi
fi

cat <<EOF

${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}
${GREEN}  vaultysclaw-sensor is running${NC}

  Dashboard:      ${COLLECTOR_URL}/
  Devices API:    ${COLLECTOR_URL}/v1/devices
  Workloads API:  ${COLLECTOR_URL}/v1/workloads
  Pending API:    ${COLLECTOR_URL}/v1/pending

  Config:         $DATA_DIR/
  Logs:           $LOG_DIR/

  It scans every 30s — give it a minute, then refresh the dashboard.
  Stop:           Ctrl+C (both processes are cleaned up automatically)
  Fresh start:    ./quickstart.sh --rotate
${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}

EOF

# Keep the script alive so the trap fires on Ctrl+C
wait
