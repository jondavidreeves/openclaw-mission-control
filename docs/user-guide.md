# OpenClaw Mission Control — User Guide

Mission Control is a read-only operational dashboard for monitoring your OpenClaw agent team. It reads runtime state from OpenClaw and presents it as a live command picture. **No changes are written back to OpenClaw.**

## Getting started

Open the dashboard in your browser (default: `http://localhost:8787`). The sidebar lists the main sections. The right-hand panel shows contextual details when you hover or click elements.

## Sections

### Overview

The primary command surface. The orchestration board shows Charlie (the central orchestrator) surrounded by specialist agents. Animated particles on the connection lines indicate live activity:

- **Outbound particles** (flowing from Charlie to an agent) — a delegation is active.
- **Inbound particles** (flowing back to Charlie) — work has completed or failed.
- **No animation** — the agent is idle with no active task.

Hover any connection line to see the agent name and current task. Click to open the full inspector with state, heartbeat, and source details.

**Demo mode**: Click the "Demo" button at the top-right of the board to simulate active delegations and preview the flow animations.

Below the board you will find:
- **Mission status** — overall health of the runtime connection.
- **Queue pressure** — how many tasks are in each pipeline stage.
- **Source health** — status of each data source feeding the dashboard.
- **Recent signals** — the latest runtime events.

### Agents

A card view of all agents visible from the OpenClaw runtime. Each card shows the agent's role, current status, utilisation, and last heartbeat. Click a card to inspect.

### Departments

Departments are a **local organisational grouping** created within Mission Control. They are not an OpenClaw concept — no department data is written to or read from OpenClaw. Departments simply group your agents for easier monitoring.

The Departments section has five tabs:

| Tab | Purpose |
|-----|---------|
| **Overview** | Department cards showing agent count, task count, and utilisation. Also contains the form to create new departments. |
| **Pipeline** | Task queue stages broken down by department. |
| **Roles** | Role staffing and availability per department. |
| **Activity** | Event timeline grouped by department and date. |
| **Manage** | Delete departments and reassign agents between departments. |

#### Configuring departments

Departments are stored in `data/teams.json`. You can manage them through the UI or edit the file directly. Each department entry has:

- `id` — unique identifier (auto-generated from the name).
- `name` — display name.
- `category` — one of: Coordination, Infrastructure, Delivery, Quality, General.
- `agents` — explicit list of OpenClaw agent IDs to include.
- `match` — glob pattern to auto-match agents by ID (e.g. `mc-gateway-*`).

### Tasks

Live delegated work from the orchestrator board. Shows each task's title, status, priority, queue stage, and assigned owner. Derived from OpenClaw runtime task runs.

### Events

Operational timeline of recent runtime events — delegations started, completed, failed, and other state changes. Sourced directly from OpenClaw task and flow history.

### Settings

Read-only snapshot of backend configuration values. No settings can be changed from the dashboard.

## Inspector panel

The right-hand rail shows contextual information. Hover any interactive element (agent card, task row, event, department card, board node) to see a preview. Click to pin the inspector with full field details.

## Data sources

Mission Control reads from:

- `~/.openclaw/openclaw.json` — agent configuration.
- `~/.openclaw/tasks/runs.sqlite` — task delegation history.
- `~/.openclaw/flows/registry.sqlite` — orchestration flow state.
- `~/.openclaw/agents/*/sessions/sessions.json` — agent session heartbeats.

All reads are **read-only**. Mission Control never modifies OpenClaw state.

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MISSION_CONTROL_API_HOST` | `127.0.0.1` | Bind address |
| `MISSION_CONTROL_API_PORT` | `8787` | Listen port |
| `MISSION_CONTROL_DB_PATH` | `./data/mission-control.sqlite` | SQLite database path |
| `OPENCLAW_STATE_DIR` | `~/.openclaw` | Path to OpenClaw runtime state |
| `MISSION_CONTROL_ENABLE_SEED` | _(unset)_ | Set to `1` to enable seed/demo data |

## Security

Mission Control serves over **plain HTTP** — there is no built-in TLS. By default it binds to `127.0.0.1`, so only the local machine can reach it.

If you access the dashboard from another machine, all traffic (board state, agent data, events) will travel unencrypted. To secure remote access:

- Place a TLS-terminating reverse proxy (Caddy, nginx) in front of Mission Control.
- Or connect via an SSH tunnel (`ssh -L 8787:localhost:8787 yourserver`).
