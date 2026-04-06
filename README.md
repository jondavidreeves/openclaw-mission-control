# OpenClaw Mission Control

## Production startup

Mission Control now supports a two-service deployment model:

- `openclaw-mission-control-api.service` — operator API + SSE
- `openclaw-mission-control-web.service` — static frontend server

### Build

```bash
npm ci
npm run build:all
```

### Install systemd units

Copy the repo to `/opt/openclaw-mission-control` or pass your install path to the helper script.

```bash
sudo ./scripts/install-systemd.sh /opt/openclaw-mission-control
```

### Service defaults

The bundled unit files intentionally do **not** enable `MISSION_CONTROL_ENABLE_SEED`.
Production startup therefore defaults to live operator mode.

Useful overrides:

- `MISSION_CONTROL_API_HOST` / `MISSION_CONTROL_API_PORT`
- `MISSION_CONTROL_WEB_HOST` / `MISSION_CONTROL_WEB_PORT`
- `MISSION_CONTROL_DB_PATH`
- `OPENCLAW_STATE_DIR` (if the runtime adapter is pointed somewhere other than `~/.openclaw`)

After editing unit overrides:

```bash
sudo systemctl daemon-reload
sudo systemctl restart openclaw-mission-control-api.service openclaw-mission-control-web.service
```
