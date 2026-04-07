#!/usr/bin/env bash
set -euo pipefail

INSTALL_DIR="${1:-$HOME/openclaw-mission-control}"
REPO="https://github.com/jondavidreeves/openclaw-mission-control.git"

echo "Installing OpenClaw Mission Control to $INSTALL_DIR"

# Check prerequisites
for cmd in git node npm; do
  if ! command -v "$cmd" &>/dev/null; then
    echo "Error: $cmd is required but not installed." >&2
    exit 1
  fi
done

NODE_MAJOR=$(node -e "process.stdout.write(String(process.versions.node.split('.')[0]))")
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo "Error: Node.js 18 or later is required (found v$(node --version))." >&2
  exit 1
fi

# Clone or update
if [ -d "$INSTALL_DIR/.git" ]; then
  echo "Updating existing installation..."
  git -C "$INSTALL_DIR" pull --ff-only
else
  echo "Cloning repository..."
  git clone "$REPO" "$INSTALL_DIR"
fi

cd "$INSTALL_DIR"

# Install dependencies and build
echo "Installing dependencies..."
npm ci

echo "Building..."
npm run build:all

# Create data directory if it doesn't exist
mkdir -p data

echo ""
echo "Installation complete."
echo ""
echo "  Start the server:  cd $INSTALL_DIR && npm run server"
echo "  Open dashboard:    http://localhost:8787"
echo ""
echo "  For systemd setup: sudo ./scripts/install-systemd.sh $INSTALL_DIR"
echo "  To uninstall:      $INSTALL_DIR/scripts/uninstall.sh"
