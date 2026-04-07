# OpenClaw Mission Control

A real-time operational dashboard for monitoring OpenClaw agent teams. Mission Control reads live runtime state from OpenClaw and presents it as an animated command picture showing orchestrator-to-agent delegations, task progress, and system health.

**Mission Control is read-only.** It observes your OpenClaw agents — it never modifies OpenClaw state.

## Features

- **Live orchestration board** — animated flow visualisation showing delegations between Charlie (orchestrator) and specialist agents, with hover/click inspection.
- **Agent roster** — real-time status, utilisation, and heartbeat for every agent.
- **Task tracking** — delegated work with queue stages, priorities, and ownership.
- **Department grouping** — organise agents into local departments for easier monitoring (departments are a Mission Control concept, not written to OpenClaw).
- **Event timeline** — recent runtime events and incidents.
- **SSE streaming** — live updates pushed to the dashboard.
- **Demo mode** — preview flow animations without live OpenClaw activity.

## Install

One-liner to clone, build, and set up:

```bash
curl -fsSL https://raw.githubusercontent.com/jondavidreeves/openclaw-mission-control/main/scripts/install.sh | bash
```

This installs to `~/openclaw-mission-control` by default. To choose a different location:

```bash
curl -fsSL https://raw.githubusercontent.com/jondavidreeves/openclaw-mission-control/main/scripts/install.sh | bash -s /opt/openclaw-mission-control
```

**Prerequisites:** Git, Node.js 18+, npm.

After installation, start the server:

```bash
cd ~/openclaw-mission-control
npm run server
```

Open `http://localhost:8787` in your browser.

### Uninstall

```bash
~/openclaw-mission-control/scripts/uninstall.sh
```

This stops any running systemd service, removes the installation directory, and leaves your OpenClaw state (`~/.openclaw`) untouched.

### Manual setup

If you prefer to install manually:

```bash
git clone https://github.com/jondavidreeves/openclaw-mission-control.git
cd openclaw-mission-control
npm ci
npm run build:all
npm run server
```

For development with hot reload:

```bash
npm run dev
```

## Documentation

- [User Guide](docs/user-guide.md) — how to use the dashboard
- [Changelog](CHANGELOG.md) — version history

## Production deployment

Mission Control runs as a single service that serves both the API and the static frontend.

### Install systemd unit

```bash
sudo ./scripts/install-systemd.sh /opt/openclaw-mission-control
```

### Service defaults

The bundled unit file intentionally does **not** enable `MISSION_CONTROL_ENABLE_SEED`.
Production startup therefore defaults to live operator mode.

### Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MISSION_CONTROL_API_HOST` | `127.0.0.1` | Bind address |
| `MISSION_CONTROL_API_PORT` | `8787` | Listen port |
| `MISSION_CONTROL_DB_PATH` | `./data/mission-control.sqlite` | SQLite database path |
| `OPENCLAW_STATE_DIR` | `~/.openclaw` | Path to OpenClaw runtime state |
| `MISSION_CONTROL_ENABLE_SEED` | _(unset)_ | Set to `1` to enable seed/demo data |

After editing unit overrides:

```bash
sudo systemctl daemon-reload
sudo systemctl restart openclaw-mission-control.service
```

## Testing

End-to-end tests use Playwright.

```bash
npm test              # run all tests headless
npm run test:ui       # run with Playwright UI
```

Tests automatically start the server if it is not already running.

## Security note

Mission Control serves over **plain HTTP** with no TLS. All traffic between the browser and the server — including board state, agent data, and events — is unencrypted. By default the server binds to `127.0.0.1` (localhost only), which limits exposure to the local machine.

If you need to access the dashboard remotely, place a TLS-terminating reverse proxy (e.g. Caddy or nginx) in front of Mission Control, or use an SSH tunnel. Do not expose the server directly to an untrusted network without encryption.

## Architecture

- **Frontend**: React 18 SPA with react-router-dom, built with Vite.
- **Backend**: Node.js HTTP server (no framework), SQLite via better-sqlite3.
- **Runtime adapter**: Reads agent state, tasks, flows, and sessions from `~/.openclaw`.
- **Streaming**: Server-Sent Events for real-time board updates.
- **Departments**: Local config overlay (`data/teams.json`) mapping agents to organisational groups.

## Version

Current release: **v1.0.0** — see [CHANGELOG.md](CHANGELOG.md) for details.
