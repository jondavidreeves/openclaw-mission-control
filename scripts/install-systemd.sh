#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="${1:-/opt/openclaw-mission-control}"
SYSTEMD_DIR="${SYSTEMD_DIR:-/etc/systemd/system}"
UNIT_NAME="openclaw-mission-control.service"

# Resolve to absolute path
PROJECT_ROOT="$(cd "$PROJECT_ROOT" && pwd)"

# Generate unit file with correct paths
cat > "/tmp/$UNIT_NAME" <<EOF
[Unit]
Description=OpenClaw Mission Control
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=$PROJECT_ROOT
Environment=NODE_ENV=production
Environment=MISSION_CONTROL_API_HOST=127.0.0.1
Environment=MISSION_CONTROL_API_PORT=8787
ExecStart=/usr/bin/env node $PROJECT_ROOT/server-dist/server/index.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

install -Dm644 "/tmp/$UNIT_NAME" "$SYSTEMD_DIR/$UNIT_NAME"
rm -f "/tmp/$UNIT_NAME"

systemctl daemon-reload
systemctl enable "$UNIT_NAME"
systemctl restart "$UNIT_NAME"

systemctl --no-pager --full status "$UNIT_NAME" || true
