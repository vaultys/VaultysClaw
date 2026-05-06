#!/usr/bin/env sh
# install.sh — One-line installer for VaultysClaw Agent Controller
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/your-org/vaultysclaw/main/install.sh | sh
#   # or
#   curl -fsSL https://your-release-url/install.sh | sh -s -- --mode web --port 3002
#
# What it does:
#   1. Detects OS and architecture
#   2. Downloads the correct pre-compiled binary from GitHub Releases
#   3. Installs to ~/.local/bin/agent-controller (or /usr/local/bin if root)
#   4. Optionally installs as a system service

set -e

# ---- Configuration ----
REPO="your-org/VaultysClaw"          # TODO: set your GitHub repo
VERSION="${VAULTYSCLAW_VERSION:-latest}"
INSTALL_DIR=""
GITHUB_BASE="https://github.com/${REPO}/releases"

# ---- Helpers ----
info()  { printf '\033[0;32m[install]\033[0m %s\n' "$*"; }
warn()  { printf '\033[0;33m[install]\033[0m %s\n' "$*"; }
error() { printf '\033[0;31m[install]\033[0m %s\n' "$*" >&2; exit 1; }

need_cmd() { command -v "$1" >/dev/null 2>&1 || error "Required command not found: $1"; }

# ---- Detect platform ----
detect_platform() {
  OS="$(uname -s)"
  ARCH="$(uname -m)"

  case "$OS" in
    Darwin)
      PLATFORM_OS="macos"
      ;;
    Linux)
      PLATFORM_OS="linux"
      ;;
    MINGW*|CYGWIN*|MSYS*|Windows_NT)
      PLATFORM_OS="windows"
      ;;
    *)
      error "Unsupported OS: $OS"
      ;;
  esac

  case "$ARCH" in
    x86_64|amd64)   PLATFORM_ARCH="x64" ;;
    arm64|aarch64)  PLATFORM_ARCH="arm64" ;;
    *)              error "Unsupported architecture: $ARCH" ;;
  esac

  if [ "$PLATFORM_OS" = "windows" ]; then
    BINARY_NAME="agent-windows-x64.exe"
    INSTALL_NAME="agent-controller.exe"
  else
    BINARY_NAME="agent-${PLATFORM_OS}-${PLATFORM_ARCH}"
    INSTALL_NAME="agent-controller"
  fi

  info "Detected platform: ${PLATFORM_OS}-${PLATFORM_ARCH}"
}

# ---- Resolve latest version ----
resolve_version() {
  if [ "$VERSION" = "latest" ]; then
    need_cmd curl
    info "Resolving latest release version..."
    VERSION=$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" \
      | grep '"tag_name"' | sed 's/.*"tag_name": *"\([^"]*\)".*/\1/')
    [ -n "$VERSION" ] || error "Could not resolve latest version from GitHub API"
    info "Latest version: $VERSION"
  fi
}

# ---- Download binary ----
download_binary() {
  DOWNLOAD_URL="${GITHUB_BASE}/download/${VERSION}/${BINARY_NAME}"
  info "Downloading from: $DOWNLOAD_URL"

  TMP_FILE="$(mktemp)"
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL --progress-bar "$DOWNLOAD_URL" -o "$TMP_FILE"
  elif command -v wget >/dev/null 2>&1; then
    wget -q --show-progress "$DOWNLOAD_URL" -O "$TMP_FILE"
  else
    error "Neither curl nor wget found. Install one of them first."
  fi

  echo "$TMP_FILE"
}

# ---- Install binary ----
install_binary() {
  TMP_FILE="$1"

  # Choose install directory
  if [ -z "$INSTALL_DIR" ]; then
    if [ "$(id -u)" -eq 0 ]; then
      INSTALL_DIR="/usr/local/bin"
    else
      INSTALL_DIR="$HOME/.local/bin"
      mkdir -p "$INSTALL_DIR"
    fi
  fi

  DEST="${INSTALL_DIR}/${INSTALL_NAME}"
  chmod +x "$TMP_FILE"
  mv "$TMP_FILE" "$DEST"
  info "Installed to: $DEST"

  # Ensure INSTALL_DIR is in PATH
  case ":${PATH}:" in
    *":${INSTALL_DIR}:"*) ;;
    *)
      warn "$INSTALL_DIR is not in PATH."
      warn "Add the following to your shell profile (~/.bashrc, ~/.zshrc, etc.):"
      warn "  export PATH=\"\$PATH:$INSTALL_DIR\""
      ;;
  esac
}

# ---- Post-install hint ----
print_success() {
  info ""
  info "VaultysClaw Agent Controller installed successfully!"
  info ""
  info "Quick start:"
  info "  agent-controller                        # headless (connects using env vars)"
  info "  agent-controller --mode tui             # terminal dashboard"
  info "  agent-controller --mode web             # web dashboard at http://localhost:3002"
  info "  agent-controller --install-service      # install as system service"
  info "  agent-controller --help                 # show all options"
  info ""
  info "Set environment variables before running:"
  info "  CONTROL_PLANE_WS_URL=wss://your-server:8080"
  info "  AGENT_NAME=my-agent"
  info ""
}

# ---- Main ----
main() {
  detect_platform
  resolve_version
  TMP="$(download_binary)"
  install_binary "$TMP"
  print_success
}

main "$@"
