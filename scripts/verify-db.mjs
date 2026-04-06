import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mission-control-db-'));
const dbPath = path.join(tempDir, 'verify.sqlite');
const db = new Database(dbPath);

db.pragma('foreign_keys = ON');
db.exec(`
  CREATE TABLE IF NOT EXISTS _migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

const migrationSource = fs.readFileSync(new URL('../src/db/migrations.ts', import.meta.url), 'utf8');
const migrationMatches = [...migrationSource.matchAll(/version:\s*(\d+),\s*name:\s*'([^']+)',\s*sql:\s*`([\s\S]*?)`/g)];
if (migrationMatches.length === 0) {
  throw new Error('Could not extract migrations from src/db/migrations.ts');
}

for (const [, version, name, sql] of migrationMatches) {
  db.exec(sql);
  db.prepare(`INSERT INTO _migrations (version, name) VALUES (?, ?)`).run(Number(version), name);
}

const expectedTables = [
  'teams',
  'agents',
  'tasks',
  'events',
  'source_sync_state',
  'overview_metrics',
  'board_config',
  'board_agent_state',
  'board_task_state',
  'task_handoffs',
];
const expectedViews = [
  'team_factory_floor_view',
  'team_pipeline_view',
  'team_role_coverage_view',
  'team_activity_view',
  'agent_list_view',
  'task_list_view',
  'orchestrator_board_view',
  'agent_board_view',
  'task_board_view',
  'handoff_board_view',
  'event_timeline_view',
  'mission_control_board_view',
];

const objects = db
  .prepare(`SELECT name, type FROM sqlite_master WHERE type IN ('table', 'view')`)
  .all();

for (const table of expectedTables) {
  assert(objects.some((entry) => entry.name === table && entry.type === 'table'), `Missing table: ${table}`);
}

for (const view of expectedViews) {
  assert(objects.some((entry) => entry.name === view && entry.type === 'view'), `Missing view: ${view}`);
}

db.prepare(`
  INSERT INTO teams (id, slug, name, status, category)
  VALUES ('team-1', 'pod-alpha', 'Pod Alpha', 'active', 'coordination')
`).run();

db.prepare(`
  INSERT INTO agents (id, team_id, slug, name, role, status, capacity, utilization_pct)
  VALUES ('agent-1', 'team-1', 'charlie', 'Charlie', 'PM / Orchestrator', 'busy', 3, 72.5)
`).run();

db.prepare(`UPDATE teams SET lead_agent_id = 'agent-1' WHERE id = 'team-1'`).run();
db.prepare(`UPDATE board_config SET orchestrator_agent_id = 'agent-1', source_mode = 'live_only', allow_seed_data = 0 WHERE id = 'mission-control'`).run();

db.prepare(`
  INSERT INTO tasks (id, team_id, owner_agent_id, title, status, priority, queue_stage, started_at, source_ref)
  VALUES ('task-1', 'team-1', 'agent-1', 'Stand up DB layer', 'in_progress', 'high', 'in_flight', CURRENT_TIMESTAMP, 'runtime:job-1')
`).run();

db.prepare(`UPDATE agents SET current_task_id = 'task-1' WHERE id = 'agent-1'`).run();

db.prepare(`
  INSERT INTO events (id, entity_type, entity_id, team_id, agent_id, task_id, source, event_type, severity, title, occurred_at)
  VALUES ('event-1', 'task', 'task-1', 'team-1', 'agent-1', 'task-1', 'runtime', 'task.updated', 'info', 'Task advanced', CURRENT_TIMESTAMP)
`).run();

db.prepare(`
  INSERT INTO source_sync_state (source, cursor, last_synced_at, status)
  VALUES ('openclaw-runtime', 'cursor-1', CURRENT_TIMESTAMP, 'live')
`).run();

db.prepare(`
  INSERT INTO board_agent_state (agent_id, source_kind, source_label, truth_status, current_job_id, last_event_id, last_event_at)
  VALUES ('agent-1', 'runtime', 'openclaw-runtime', 'live', 'task-1', 'event-1', CURRENT_TIMESTAMP)
`).run();

db.prepare(`
  INSERT INTO board_task_state (task_id, source_kind, source_label, truth_status, last_transition_event_id, last_transition_at)
  VALUES ('task-1', 'runtime', 'openclaw-runtime', 'live', 'event-1', CURRENT_TIMESTAMP)
`).run();

db.prepare(`
  INSERT INTO task_handoffs (id, task_id, from_agent_id, to_agent_id, handoff_type, status, reason, source_kind, source_label, requested_at)
  VALUES ('handoff-1', 'task-1', 'agent-1', 'agent-1', 'assignment', 'pending', 'Initial dispatch', 'runtime', 'openclaw-runtime', CURRENT_TIMESTAMP)
`).run();

db.prepare(`UPDATE board_task_state SET active_handoff_id = 'handoff-1' WHERE task_id = 'task-1'`).run();

db.prepare(`
  INSERT INTO overview_metrics (metric_key, metric_value, metric_unit, as_of, window_label)
  VALUES ('active_tasks', 1, 'count', CURRENT_TIMESTAMP, 'live')
`).run();

const agentView = db.prepare(`SELECT team_name, current_task_title, truth_status FROM agent_board_view WHERE agent_id = 'agent-1'`).get();
assert.equal(agentView.team_name, 'Pod Alpha');
assert.equal(agentView.current_task_title, 'Stand up DB layer');
assert.equal(agentView.truth_status, 'live');

const taskView = db.prepare(`SELECT owner_agent_name, team_slug, active_handoff_id, truth_status FROM task_board_view WHERE task_id = 'task-1'`).get();
assert.equal(taskView.owner_agent_name, 'Charlie');
assert.equal(taskView.team_slug, 'pod-alpha');
assert.equal(taskView.active_handoff_id, 'handoff-1');
assert.equal(taskView.truth_status, 'live');

const boardView = db.prepare(`SELECT board_truth_status, pending_handoffs, degraded_sources FROM mission_control_board_view`).get();
assert.equal(boardView.board_truth_status, 'live');
assert.equal(boardView.pending_handoffs, 1);
assert.equal(boardView.degraded_sources, 0);

const orchestratorView = db.prepare(`SELECT orchestrator_name, truth_status FROM orchestrator_board_view`).get();
assert.equal(orchestratorView.orchestrator_name, 'Charlie');
assert.equal(orchestratorView.truth_status, 'live');

const handoffView = db.prepare(`SELECT task_title, from_agent_name, to_agent_name FROM handoff_board_view WHERE handoff_id = 'handoff-1'`).get();
assert.equal(handoffView.task_title, 'Stand up DB layer');
assert.equal(handoffView.from_agent_name, 'Charlie');
assert.equal(handoffView.to_agent_name, 'Charlie');

const timelineView = db.prepare(`SELECT truth_status, task_title FROM event_timeline_view WHERE id = 'event-1'`).get();
assert.equal(timelineView.truth_status, 'live');
assert.equal(timelineView.task_title, 'Stand up DB layer');

console.log(`DB verification passed at ${dbPath}`);

db.close();
fs.rmSync(tempDir, { recursive: true, force: true });
