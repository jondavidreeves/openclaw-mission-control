# Changelog

All notable changes to OpenClaw Mission Control are documented here.

## v1.0.0 — 2026-04-07

### Added
- **Orchestration board** with animated real-time flow visualisation showing delegations between Charlie and specialist agents.
- **Demo mode** toggle on the orchestration board to preview flow animations without live OpenClaw activity.
- **Department management** — create, delete, and assign agents to departments from the dashboard. Departments are a local organisational overlay; no changes are written to OpenClaw.
- **Department views** — Factory Floor overview, Pipeline stages, Role coverage, Activity timeline, and Manage page available as tabs within the Departments section.
- **Config-driven department mapping** via `data/teams.json` with support for explicit agent lists and glob patterns.
- **Live runtime adapter** reading agent state, task delegations, flows, and events from `~/.openclaw`.
- **Single-service architecture** — API server and static frontend served from one process.
- **SSE streaming** for real-time board updates.
- **Inspector panel** — hover and click any element on the board, agent roster, or task list to view details.
- **Playwright end-to-end tests** covering navigation, API endpoints, departments, and the orchestration board.
- **Version display** in the sidebar footer.

### Fixed
- Select dropdown elements now have visible text on dark backgrounds.
- Duplicate department creation returns a clear inline error instead of a server error popup.
- Empty departments (no agents assigned) now appear in all department views.
- Error messages from the API are shown in plain English.
