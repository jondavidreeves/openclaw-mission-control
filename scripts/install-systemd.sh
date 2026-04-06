#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT=${1:-/opt/openclaw-mission-control}
SYSTEMD_DIR=${SYSTEMD_DIR:-/etc/systemd/system}

install -Dm644 "$PROJECT_ROOT/systemd/openclaw-mission-control-api.service" "$SYSTEMD_DIR/openclaw-mission-control-api.service"
install -Dm644 "$PROJECT_ROOT/systemd/openclaw-mission-control-web.service" "$SYSTEMD_DIR/openclaw-mission-control-web.service"

systemctl daemon-reload
systemctl enable openclaw-mission-control-api.service openclaw-mission-control-web.service
systemctl restart openclaw-mission-control-api.service openclaw-mission-control-web.service

systemctl --no-pager --full status openclaw-mission-control-api.service openclaw-mission-control-web.service || true
