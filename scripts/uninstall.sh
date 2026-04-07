#!/usr/bin/env bash
set -euo pipefail

INSTALL_DIR="${1:-$(cd "$(dirname "$0")/.." && pwd)}"
SYSTEMD_UNIT="openclaw-mission-control.service"
SYSTEMD_DIR="${SYSTEMD_DIR:-/etc/systemd/system}"

echo "Uninstalling OpenClaw Mission Control from $INSTALL_DIR"

# Stop and remove systemd service if present
if [ -f "$SYSTEMD_DIR/$SYSTEMD_UNIT" ]; then
  echo "Stopping and removing systemd service..."
  sudo systemctl stop "$SYSTEMD_UNIT" 2>/dev/null || true
  sudo systemctl disable "$SYSTEMD_UNIT" 2>/dev/null || true
  sudo rm -f "$SYSTEMD_DIR/$SYSTEMD_UNIT"
  sudo systemctl daemon-reload
  echo "Systemd service removed."
else
  echo "No systemd service found — skipping."
fi

# Confirm before removing files
echo ""
echo "This will delete: $INSTALL_DIR"
echo "Including any local data (departments, database)."
echo ""
read -rp "Continue? [y/N] " confirm
if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
  echo "Aborted."
  exit 0
fi

rm -rf "$INSTALL_DIR"
echo "Removed $INSTALL_DIR"
echo ""
echo "Uninstall complete. OpenClaw state (~/.openclaw) was not touched."
