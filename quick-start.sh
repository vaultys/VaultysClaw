#!/usr/bin/env bash
# quick-start.sh — One-command local bootstrap for VaultysClaw.
#
# What it does:
#   1. Checks required tools (docker, node, npm, openssl) and offers to install
#      any that are missing, with your confirmation.
#   2. Writes packages/control-plane/.env (NEXTAUTH_SECRET generated via openssl).
#   3. Installs workspace dependencies with pnpm (bootstrapped via corepack).
#   4. Builds and starts the full Docker stack (docker/docker-compose.yml).
#   5. Waits for the control plane, then opens http://localhost:3000/quick-start.
#
# Usage:
#   ./quick-start.sh
#   ./quick-start.sh --yes      # assume "yes" to every prompt (non-interactive)

set -euo pipefail

# ── Configuration ────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="$SCRIPT_DIR/packages/control-plane/.env"
DB_USER="vaultys"
DB_PASSWORD="vaultys_dev_secret"
DB_NAME="vaultysclaw"
CONTROL_PLANE_URL="http://localhost:3000"
QUICK_START_URL="$CONTROL_PLANE_URL/quick-start"
HEALTH_URL="$CONTROL_PLANE_URL/api/health"

ASSUME_YES=false
case "${1:-}" in
  -y | --yes) ASSUME_YES=true ;;
esac

# ── Helpers ──────────────────────────────────────────────────────────────────
info()  { printf '\033[0;32m[quick-start]\033[0m %s\n' "$*"; }
warn()  { printf '\033[0;33m[quick-start]\033[0m %s\n' "$*"; }
error() { printf '\033[0;31m[quick-start]\033[0m %s\n' "$*" >&2; exit 1; }

# ask "question" → 0 (yes) / 1 (no)
ask() {
  if [ "$ASSUME_YES" = true ]; then return 0; fi
  printf '\033[0;36m[quick-start]\033[0m %s [y/N] ' "$1"
  read -r reply </dev/tty || reply=""
  case "$reply" in [yY] | [yY][eE][sS]) return 0 ;; *) return 1 ;; esac
}

have() { command -v "$1" >/dev/null 2>&1; }

SUDO=""
if [ "$(id -u)" -ne 0 ] && have sudo; then SUDO="sudo"; fi

# ── OS / package manager detection ─────────────────────────────────────────────
detect_pm() {
  if have apt-get; then PM="apt"; return; fi
  if have dnf;     then PM="dnf"; return; fi
  if have yum;     then PM="yum"; return; fi
  if have pacman;  then PM="pacman"; return; fi
  if have zypper;  then PM="zypper"; return; fi
  if have brew;    then PM="brew"; return; fi
  PM=""
}

# pm_install <pkg...>
pm_install() {
  case "$PM" in
    apt)    $SUDO apt-get update -y && $SUDO apt-get install -y "$@" ;;
    dnf)    $SUDO dnf install -y "$@" ;;
    yum)    $SUDO yum install -y "$@" ;;
    pacman) $SUDO pacman -Sy --noconfirm "$@" ;;
    zypper) $SUDO zypper install -y "$@" ;;
    brew)   brew install "$@" ;;
    *)      return 1 ;;
  esac
}

# Map a logical dependency to its package name for the detected PM.
pkg_name() {
  dep="$1"
  case "$dep" in
    node)
      case "$PM" in
        apt | dnf | yum | zypper) echo "nodejs" ;;
        pacman) echo "nodejs npm" ;;
        brew) echo "node" ;;
      esac ;;
    npm)
      case "$PM" in
        apt | dnf | yum | zypper) echo "npm" ;;
        pacman) echo "npm" ;;
        brew) echo "node" ;;
      esac ;;
    openssl) echo "openssl" ;;
    docker)
      case "$PM" in
        apt) echo "docker.io docker-compose-plugin" ;;
        dnf | yum) echo "docker docker-compose-plugin" ;;
        pacman) echo "docker docker-compose" ;;
        zypper) echo "docker docker-compose" ;;
        brew) echo "docker" ;;
      esac ;;
  esac
}

# ensure_dep <logical-dep> <command-to-check>
ensure_dep() {
  dep="$1"; cmd="$2"
  if have "$cmd"; then
    info "✓ $dep found ($(command -v "$cmd"))"
    return 0
  fi
  warn "✗ $dep is not installed."
  if [ -z "$PM" ]; then
    error "No supported package manager detected. Please install '$dep' manually and re-run."
  fi
  pkgs="$(pkg_name "$dep")"
  if ask "Install $dep now ($PM: $pkgs)?"; then
    # shellcheck disable=SC2086
    pm_install $pkgs || error "Failed to install $dep. Please install it manually and re-run."
    have "$cmd" || error "$dep still not available after install. Please check your setup."
    info "✓ $dep installed"
  else
    error "$dep is required. Aborting."
  fi
}

# ── 1. Dependency checks ───────────────────────────────────────────────────────
check_dependencies() {
  info "Checking required tools…"
  detect_pm
  [ -n "$PM" ] && info "Package manager: $PM" || warn "No package manager detected — missing tools must be installed manually."

  ensure_dep node node
  ensure_dep npm npm
  ensure_dep openssl openssl
  ensure_dep docker docker

  # Docker Compose v2 plugin
  if docker compose version >/dev/null 2>&1; then
    info "✓ docker compose found"
  else
    warn "✗ 'docker compose' plugin not available."
    if [ -n "$PM" ] && ask "Install the docker compose plugin now?"; then
      case "$PM" in
        apt) pm_install docker-compose-plugin ;;
        dnf | yum) pm_install docker-compose-plugin ;;
        *) pm_install docker-compose || true ;;
      esac
    fi
    docker compose version >/dev/null 2>&1 || error "'docker compose' is required. Please install the Compose plugin and re-run."
  fi

  # Docker daemon reachable?
  if ! docker info >/dev/null 2>&1; then
    warn "The Docker daemon is not reachable. You may need to start it (e.g. 'sudo systemctl start docker') or add your user to the 'docker' group."
    ask "Continue anyway?" || error "Docker daemon must be running. Aborting."
  fi
}

# ── 2. Generate the control-plane .env ─────────────────────────────────────────
write_env() {
  if [ -f "$ENV_FILE" ]; then
    if ! ask "$ENV_FILE already exists. Overwrite it?"; then
      info "Keeping existing .env."
      # Reuse the existing secret so the Docker stack stays consistent.
      NEXTAUTH_SECRET_VALUE="$(grep -E '^NEXTAUTH_SECRET=' "$ENV_FILE" | head -1 | cut -d= -f2- || true)"
      return 0
    fi
  fi

  info "Generating NEXTAUTH_SECRET with openssl…"
  secret="$(openssl rand -base64 32)"

  mkdir -p "$(dirname "$ENV_FILE")"
  cat > "$ENV_FILE" <<EOF
# VaultysClaw Control Plane — Environment Variables
# Base URL for next-auth (adjust for production)
NEXTAUTH_URL=http://localhost:3000
NODE_ENV=development
PORT=3000
WS_PORT=8080
# Required for next-auth JWT signing. Generate with: openssl rand -base64 32
NEXTAUTH_SECRET=$secret
DATABASE_URL=postgresql://$DB_USER:$DB_PASSWORD@localhost:5432/$DB_NAME

# ── OIDC / Generic SSO (optional) ────────────────────────────────────────────
# When set, an SSO login button appears on the login page alongside VaultysId.
# First-time OIDC users land on /claim to link their VaultysId before accessing the app.
# OIDC_ISSUER=https://accounts.example.com
# OIDC_CLIENT_ID=your-client-id
# OIDC_CLIENT_SECRET=your-client-secret
# OIDC_PROVIDER_NAME=SSO   # Button label (default: "SSO")
# Callback URL to register with your IdP: http://localhost:3000/api/auth/callback/oidc

# ── OpenTelemetry ─────────────────────────────────────────────────────────────
# Set to true to enable tracing + metrics export
OTEL_ENABLED=false
# OTLP/HTTP endpoint (Jaeger, Grafana Tempo, Honeycomb, etc.)
# OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
# OTEL_SERVICE_NAME=vaultysclaw-control-plane
VC_DEV_LOGIN=true
EOF

  # Persist the generated secret so the Docker stack uses the same one.
  NEXTAUTH_SECRET_VALUE="$secret"
  info "Wrote $ENV_FILE"
}

# ── 3. Install workspace dependencies (pnpm via corepack) ──────────────────────
install_deps() {
  info "Enabling pnpm via corepack…"
  if ! corepack enable >/dev/null 2>&1; then
    $SUDO corepack enable >/dev/null 2>&1 || warn "corepack enable failed; falling back to 'npx pnpm'."
  fi
  corepack prepare pnpm@10.33.2 --activate >/dev/null 2>&1 || true

  info "Installing dependencies (pnpm install)…"
  if have pnpm; then
    (cd "$SCRIPT_DIR" && pnpm install)
  else
    (cd "$SCRIPT_DIR" && npx --yes pnpm@10.33.2 install)
  fi
}

# ── 4. Build & start the Docker stack ──────────────────────────────────────────
start_stack() {
  info "Building and starting the Docker stack (this can take a few minutes)…"
  (
    cd "$SCRIPT_DIR/docker" &&
      PG_PASSWORD="$DB_PASSWORD" \
      NEXTAUTH_SECRET="${NEXTAUTH_SECRET_VALUE:-}" \
      NEXTAUTH_URL="$CONTROL_PLANE_URL" \
      VC_DEV_LOGIN=true \
      docker compose up --build -d
  )
}

# ── 5. Wait for readiness and open the browser ─────────────────────────────────
open_browser() {
  if have xdg-open;     then xdg-open "$1" >/dev/null 2>&1 &
  elif have open;       then open "$1" >/dev/null 2>&1 &
  elif have powershell; then powershell.exe -NoProfile Start-Process "$1" >/dev/null 2>&1 &
  else warn "Could not detect a browser opener — visit $1 manually."; fi
}

wait_and_open() {
  info "Waiting for the control plane at $HEALTH_URL …"
  for _ in $(seq 1 120); do
    if curl -sf "$HEALTH_URL" >/dev/null 2>&1; then
      info "Control plane is up."
      info "Opening $QUICK_START_URL"
      open_browser "$QUICK_START_URL"
      return 0
    fi
    sleep 3
  done
  warn "Timed out waiting for the control plane."
  warn "Check progress with: cd docker && docker compose logs -f control-plane"
  warn "Once it is up, open: $QUICK_START_URL"
}

# ── Main ───────────────────────────────────────────────────────────────────────
main() {
  info "VaultysClaw quick start"
  check_dependencies
  write_env
  install_deps
  start_stack
  wait_and_open
  info "Done."
}

main "$@"
