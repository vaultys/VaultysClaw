#!/usr/bin/env bash
# =============================================================================
# stop.sh — Arrête tous les services VaultysClaw en cours d'exécution
#
# Couvre les trois modes de lancement :
#   1. docker compose up (docker-compose.yml, .test.yml, .litellm.yml)
#   2. demo/simulator/demo-up.sh  (containers vc-demo-*, pid file .demo-sim-pids)
#   3. demo/setup.sh              (containers vaultysclaw-demo-*, pid file .demo-pids)
#
# Usage:
#   ./stop.sh
# =============================================================================

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEMO_DIR="$REPO_ROOT/demo"

# ── Colours ───────────────────────────────────────────────────────────────────
if [[ -t 1 ]]; then
  GREEN='\033[0;32m' YELLOW='\033[1;33m' RED='\033[0;31m' CYAN='\033[0;36m' NC='\033[0m'
else
  GREEN='' YELLOW='' RED='' CYAN='' NC=''
fi

ok()   { echo -e "${GREEN}✔${NC}  $*"; }
warn() { echo -e "${YELLOW}⚠${NC}  $*"; }
step() { echo -e "\n${CYAN}── $* ──────────────────────────────────${NC}"; }

ERRORS=0
error() { echo -e "${RED}✗${NC}  $*" >&2; ERRORS=$((ERRORS+1)); }

# ── Helper : tuer un container Docker ─────────────────────────────────────────
stop_container() {
  local name="$1"
  if docker inspect "$name" &>/dev/null 2>&1; then
    if docker stop "$name" &>/dev/null 2>&1; then
      ok "Stopped container: $name"
    else
      error "Failed to stop container: $name"
    fi
  fi
}

# =============================================================================
# 1. Docker Compose — fichiers à la racine du repo
# =============================================================================
step "Docker Compose stacks"

compose_down() {
  local file="$1"
  if [[ -f "$REPO_ROOT/$file" ]]; then
    if docker compose -f "$REPO_ROOT/$file" ps -q 2>/dev/null | grep -q .; then
      echo "  Stopping $file …"
      if docker compose -f "$REPO_ROOT/$file" down --remove-orphans 2>/dev/null; then
        ok "$file stopped"
      else
        error "docker compose down failed for $file"
      fi
    else
      echo "  $file — no running containers, skipping"
    fi
  fi
}

compose_down "docker-compose.yml"
compose_down "docker-compose.test.yml"
compose_down "docker-compose.litellm.yml"

# =============================================================================
# 2. Processus Node.js — control-plane et agents (setup.sh / demo-up.sh)
# =============================================================================
step "Node.js processes (control-plane, agents, simulator)"

kill_pids_file() {
  local file="$1"
  local label="$2"
  if [[ -f "$file" ]]; then
    local count=0
    while IFS= read -r pid; do
      [[ -z "$pid" ]] && continue
      if kill "$pid" 2>/dev/null; then
        count=$((count+1))
      fi
    done < "$file"
    rm -f "$file"
    [[ $count -gt 0 ]] && ok "Killed $count $label process(es)" || echo "  $label — no processes to kill"
  fi
}

kill_pids_file "$DEMO_DIR/.demo-pids"     "setup.sh"
kill_pids_file "$DEMO_DIR/.demo-sim-pids" "simulator"

# Filet de sécurité : tuer les processus tsx restants liés à VaultysClaw
pkill -f "tsx.*control-plane.*server\.ts"      2>/dev/null && ok "Killed leftover control-plane (tsx)" || true
pkill -f "tsx.*agent-controller.*src/cli\.ts"  2>/dev/null && ok "Killed leftover agent-controller (tsx)" || true
pkill -f "tsx/dist/cli\.mjs src/cli\.ts"       2>/dev/null && ok "Killed leftover agent-controller (cli)" || true
pkill -f "tsx.*simulator"                      2>/dev/null && ok "Killed leftover simulator (tsx)" || true

# =============================================================================
# 3. Containers Docker individuels — demo-up.sh (vc-demo-*)
# =============================================================================
step "Containers vc-demo-* (demo-up.sh)"

VC_DEMO_CONTAINERS=(
  vc-demo-postgres
  vc-demo-minio
  vc-demo-docling
  vc-demo-litellm
  vc-demo-otel-collector
  vc-demo-tempo
  vc-demo-prometheus
  vc-demo-grafana
)

for cname in "${VC_DEMO_CONTAINERS[@]}"; do
  stop_container "$cname"
done

# Lire le fichier de containers du simulateur s'il existe
if [[ -f "$DEMO_DIR/.demo-sim-containers" ]]; then
  while IFS= read -r cname; do
    [[ -z "$cname" ]] && continue
    stop_container "$cname"
  done < "$DEMO_DIR/.demo-sim-containers"
  rm -f "$DEMO_DIR/.demo-sim-containers"
fi

# =============================================================================
# 4. Containers Docker individuels — setup.sh (vaultysclaw-demo-*)
# =============================================================================
step "Containers vaultysclaw-demo-* (setup.sh)"

SETUP_CONTAINERS=(
  vaultysclaw-demo-minio
  vaultysclaw-demo-docling
)

for cname in "${SETUP_CONTAINERS[@]}"; do
  stop_container "$cname"
done

# Lire le fichier de containers du setup s'il existe
if [[ -f "$DEMO_DIR/.demo-docker-containers" ]]; then
  while IFS= read -r cname; do
    [[ -z "$cname" ]] && continue
    stop_container "$cname"
  done < "$DEMO_DIR/.demo-docker-containers"
  rm -f "$DEMO_DIR/.demo-docker-containers"
fi

# =============================================================================
# 5. Fallback : tous les containers dont le nom contient "vaultysclaw" ou "vc-"
# =============================================================================
step "Fallback — tous les containers VaultysClaw restants"

mapfile -t REMAINING < <(docker ps -a --format '{{.Names}}' 2>/dev/null | grep -E '(vaultysclaw|vc-demo|vc_)' || true)

if [[ ${#REMAINING[@]} -gt 0 ]]; then
  for cname in "${REMAINING[@]}"; do
    stop_container "$cname"
  done
else
  echo "  Aucun container VaultysClaw restant."
fi

# =============================================================================
# Résumé
# =============================================================================
echo
if [[ $ERRORS -eq 0 ]]; then
  echo -e "${GREEN}Tous les services VaultysClaw ont été arrêtés.${NC}"
else
  echo -e "${YELLOW}Terminé avec $ERRORS erreur(s) — voir les messages ci-dessus.${NC}"
  exit 1
fi
