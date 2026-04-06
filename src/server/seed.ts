import type Database from 'better-sqlite3';

function iso(offsetMinutes = 0): string {
  return new Date(Date.now() + offsetMinutes * 60_000).toISOString();
}

export function seedMissionControl(db: Database.Database): void {
  const teamCount = db.prepare(`SELECT COUNT(*) as count FROM teams`).get() as { count: number };
  if (teamCount.count > 0) return;

  const insertTeam = db.prepare(`
    INSERT INTO teams (id, slug, name, status, category, lead_agent_id, description, created_at, updated_at)
    VALUES (@id, @slug, @name, @status, @category, @lead_agent_id, @description, @created_at, @updated_at)
  `);

  const insertAgent = db.prepare(`
    INSERT INTO agents (id, team_id, slug, name, role, status, capacity, utilization_pct, current_task_id, last_heartbeat_at, created_at, updated_at)
    VALUES (@id, @team_id, @slug, @name, @role, @status, @capacity, @utilization_pct, @current_task_id, @last_heartbeat_at, @created_at, @updated_at)
  `);

  const insertTask = db.prepare(`
    INSERT INTO tasks (id, team_id, owner_agent_id, source_ref, external_ref, title, description, status, priority, queue_stage, blocked_reason, opened_at, started_at, completed_at, due_at, created_at, updated_at)
    VALUES (@id, @team_id, @owner_agent_id, @source_ref, @external_ref, @title, @description, @status, @priority, @queue_stage, @blocked_reason, @opened_at, @started_at, @completed_at, @due_at, @created_at, @updated_at)
  `);

  const insertEvent = db.prepare(`
    INSERT INTO events (id, entity_type, entity_id, team_id, agent_id, task_id, source, event_type, severity, title, detail, payload_json, occurred_at, created_at)
    VALUES (@id, @entity_type, @entity_id, @team_id, @agent_id, @task_id, @source, @event_type, @severity, @title, @detail, @payload_json, @occurred_at, @created_at)
  `);

  const insertOverviewMetric = db.prepare(`
    INSERT INTO overview_metrics (metric_key, metric_value, metric_unit, as_of, window_label, updated_at)
    VALUES (@metric_key, @metric_value, @metric_unit, @as_of, @window_label, @updated_at)
  `);

  const insertSourceState = db.prepare(`
    INSERT INTO source_sync_state (source, cursor, last_synced_at, status, error_message, metadata_json, updated_at)
    VALUES (@source, @cursor, @last_synced_at, @status, @error_message, @metadata_json, @updated_at)
  `);

  const insertBoardAgentState = db.prepare(`
    INSERT INTO board_agent_state (agent_id, source_kind, source_label, truth_status, degraded_reason, current_job_id, last_event_id, last_event_at, updated_at)
    VALUES (@agent_id, @source_kind, @source_label, @truth_status, @degraded_reason, @current_job_id, @last_event_id, @last_event_at, @updated_at)
  `);

  const insertBoardTaskState = db.prepare(`
    INSERT INTO board_task_state (task_id, source_kind, source_label, truth_status, degraded_reason, active_handoff_id, last_transition_event_id, last_transition_at, updated_at)
    VALUES (@task_id, @source_kind, @source_label, @truth_status, @degraded_reason, @active_handoff_id, @last_transition_event_id, @last_transition_at, @updated_at)
  `);

  const insertTaskHandoff = db.prepare(`
    INSERT INTO task_handoffs (id, task_id, from_agent_id, to_agent_id, handoff_type, status, reason, source_kind, source_label, requested_at, accepted_at, completed_at, updated_at)
    VALUES (@id, @task_id, @from_agent_id, @to_agent_id, @handoff_type, @status, @reason, @source_kind, @source_label, @requested_at, @accepted_at, @completed_at, @updated_at)
  `);

  const txn = db.transaction(() => {
    const now = iso();

    const teams = [
      { id: 'team-alpha', slug: 'pod-alpha', name: 'Pod Alpha', status: 'active', category: 'coordination', lead_agent_id: null, description: 'Primary orchestrator pod.', created_at: now, updated_at: now },
      { id: 'team-bravo', slug: 'pod-bravo', name: 'Pod Bravo', status: 'active', category: 'frontend', lead_agent_id: null, description: 'Frontend delivery pod.', created_at: now, updated_at: now },
      { id: 'team-charlie', slug: 'pod-charlie', name: 'Pod Charlie', status: 'active', category: 'backend', lead_agent_id: null, description: 'Backend and integration pod.', created_at: now, updated_at: now },
    ];

    teams.forEach((row) => insertTeam.run(row));

    const agents = [
      { id: 'agent-charlie', team_id: 'team-alpha', slug: 'charlie', name: 'Charlie', role: 'PM / Orchestrator', status: 'busy', capacity: 3, utilization_pct: 78, current_task_id: null, last_heartbeat_at: iso(-2), created_at: now, updated_at: now },
      { id: 'agent-jules', team_id: 'team-alpha', slug: 'jules', name: 'Jules', role: 'PM / Orchestrator', status: 'online', capacity: 2, utilization_pct: 52, current_task_id: null, last_heartbeat_at: iso(-5), created_at: now, updated_at: now },
      { id: 'agent-piper', team_id: 'team-bravo', slug: 'piper', name: 'Piper', role: 'Frontend Developer', status: 'busy', capacity: 2, utilization_pct: 74, current_task_id: null, last_heartbeat_at: iso(-3), created_at: now, updated_at: now },
      { id: 'agent-cleo', team_id: 'team-bravo', slug: 'cleo', name: 'Cleo', role: 'Frontend Developer', status: 'idle', capacity: 2, utilization_pct: 26, current_task_id: null, last_heartbeat_at: iso(-8), created_at: now, updated_at: now },
      { id: 'agent-rhea', team_id: 'team-charlie', slug: 'rhea', name: 'Rhea', role: 'Backend Developer', status: 'busy', capacity: 3, utilization_pct: 81, current_task_id: null, last_heartbeat_at: iso(-1), created_at: now, updated_at: now },
      { id: 'agent-omar', team_id: 'team-charlie', slug: 'omar', name: 'Omar', role: 'Backend Developer', status: 'online', capacity: 2, utilization_pct: 61, current_task_id: null, last_heartbeat_at: iso(-4), created_at: now, updated_at: now },
    ];

    agents.forEach((row) => insertAgent.run(row));

    db.prepare(`UPDATE teams SET lead_agent_id = 'agent-charlie' WHERE id = 'team-alpha'`).run();
    db.prepare(`UPDATE teams SET lead_agent_id = 'agent-piper' WHERE id = 'team-bravo'`).run();
    db.prepare(`UPDATE teams SET lead_agent_id = 'agent-rhea' WHERE id = 'team-charlie'`).run();

    const tasks = [
      { id: 'task-overview', team_id: 'team-alpha', owner_agent_id: 'agent-charlie', source_ref: 'local:seed', external_ref: 'MC-101', title: 'Wire overview aggregates', description: 'Connect overview page to backend metrics.', status: 'in_progress', priority: 'high', queue_stage: 'in_flight', blocked_reason: null, opened_at: iso(-180), started_at: iso(-160), completed_at: null, due_at: iso(360), created_at: iso(-200), updated_at: iso(-10) },
      { id: 'task-triage', team_id: 'team-alpha', owner_agent_id: 'agent-jules', source_ref: 'local:seed', external_ref: 'MC-102', title: 'Triage inbound runtime events', description: 'Review overnight queue and assign owners.', status: 'ready', priority: 'normal', queue_stage: 'ready', blocked_reason: null, opened_at: iso(-240), started_at: null, completed_at: null, due_at: iso(240), created_at: iso(-250), updated_at: iso(-30) },
      { id: 'task-ui-shell', team_id: 'team-bravo', owner_agent_id: 'agent-piper', source_ref: 'local:seed', external_ref: 'MC-201', title: 'Integrate factory floor API', description: 'Replace placeholder cards with API-backed models.', status: 'in_progress', priority: 'high', queue_stage: 'in_flight', blocked_reason: null, opened_at: iso(-300), started_at: iso(-260), completed_at: null, due_at: iso(120), created_at: iso(-320), updated_at: iso(-12) },
      { id: 'task-api-mvp', team_id: 'team-charlie', owner_agent_id: 'agent-rhea', source_ref: 'local:seed', external_ref: 'MC-301', title: 'Ship backend MVP endpoints', description: 'Expose read API and SSE contracts for the shell.', status: 'in_progress', priority: 'urgent', queue_stage: 'in_flight', blocked_reason: null, opened_at: iso(-420), started_at: iso(-360), completed_at: null, due_at: iso(60), created_at: iso(-430), updated_at: iso(-6) },
      { id: 'task-runtime-adapter', team_id: 'team-charlie', owner_agent_id: 'agent-omar', source_ref: 'local:seed', external_ref: 'MC-302', title: 'Sketch runtime ingestion adapter', description: 'Prepare adapter boundary for OpenClaw runtime source ingestion.', status: 'blocked', priority: 'normal', queue_stage: 'review', blocked_reason: 'Awaiting runtime event contract handshake.', opened_at: iso(-500), started_at: iso(-420), completed_at: null, due_at: iso(480), created_at: iso(-520), updated_at: iso(-20) },
    ];

    tasks.forEach((row) => insertTask.run(row));

    db.prepare(`UPDATE agents SET current_task_id = 'task-overview' WHERE id = 'agent-charlie'`).run();
    db.prepare(`UPDATE agents SET current_task_id = 'task-triage' WHERE id = 'agent-jules'`).run();
    db.prepare(`UPDATE agents SET current_task_id = 'task-ui-shell' WHERE id = 'agent-piper'`).run();
    db.prepare(`UPDATE agents SET current_task_id = 'task-api-mvp' WHERE id = 'agent-rhea'`).run();
    db.prepare(`UPDATE agents SET current_task_id = 'task-runtime-adapter' WHERE id = 'agent-omar'`).run();

    const events = [
      { id: 'event-1', entity_type: 'task', entity_id: 'task-api-mvp', team_id: 'team-charlie', agent_id: 'agent-rhea', task_id: 'task-api-mvp', source: 'runtime', event_type: 'task.updated', severity: 'info', title: 'Backend MVP work advancing', detail: 'API wiring progressed to route implementation.', payload_json: JSON.stringify({ status: 'in_progress', queueStage: 'in_flight' }), occurred_at: iso(-6), created_at: iso(-6) },
      { id: 'event-2', entity_type: 'team', entity_id: 'team-alpha', team_id: 'team-alpha', agent_id: 'agent-charlie', task_id: 'task-overview', source: 'operator', event_type: 'queue.alert', severity: 'warning', title: 'Coordination queue pressure rising', detail: 'Pod Alpha is above the normal active load.', payload_json: JSON.stringify({ activeTasks: 2, blockedTasks: 0 }), occurred_at: iso(-25), created_at: iso(-25) },
      { id: 'event-3', entity_type: 'task', entity_id: 'task-runtime-adapter', team_id: 'team-charlie', agent_id: 'agent-omar', task_id: 'task-runtime-adapter', source: 'github', event_type: 'task.blocked', severity: 'warning', title: 'Runtime adapter blocked', detail: 'Waiting for source contract details.', payload_json: JSON.stringify({ blockedReason: 'Awaiting runtime event contract handshake.' }), occurred_at: iso(-20), created_at: iso(-20) },
      { id: 'event-4', entity_type: 'agent', entity_id: 'agent-piper', team_id: 'team-bravo', agent_id: 'agent-piper', task_id: 'task-ui-shell', source: 'runtime', event_type: 'agent.heartbeat', severity: 'info', title: 'Frontend lead heartbeat', detail: 'Agent remains online and actively delivering.', payload_json: JSON.stringify({ utilizationPct: 74 }), occurred_at: iso(-3), created_at: iso(-3) }
    ];

    events.forEach((row) => insertEvent.run(row));

    [
      { metric_key: 'teams_total', metric_value: 3, metric_unit: 'count', as_of: now, window_label: 'live', updated_at: now },
      { metric_key: 'agents_online', metric_value: 6, metric_unit: 'count', as_of: now, window_label: 'live', updated_at: now },
      { metric_key: 'tasks_active', metric_value: 3, metric_unit: 'count', as_of: now, window_label: 'live', updated_at: now },
      { metric_key: 'tasks_blocked', metric_value: 1, metric_unit: 'count', as_of: now, window_label: 'live', updated_at: now },
      { metric_key: 'events_24h', metric_value: 4, metric_unit: 'count', as_of: now, window_label: '24h', updated_at: now },
    ].forEach((row) => insertOverviewMetric.run(row));

    db.prepare(`UPDATE board_config SET orchestrator_agent_id = 'agent-charlie', source_mode = 'seed_demo', allow_seed_data = 1, degraded_reason = 'Seed/demo bootstrap mode enabled.' WHERE id = 'mission-control'`).run();

    [
      { source: 'local-db', cursor: 'seed:v1', last_synced_at: now, status: 'ok', error_message: null, metadata_json: JSON.stringify({ mode: 'sqlite-seed' }), updated_at: now },
      { source: 'openclaw-runtime', cursor: null, last_synced_at: null, status: 'not_configured', error_message: null, metadata_json: JSON.stringify({ adapter: 'placeholder', readyForNextStep: true }), updated_at: now },
    ].forEach((row) => insertSourceState.run(row));

    const handoffs = [
      { id: 'handoff-1', task_id: 'task-ui-shell', from_agent_id: 'agent-charlie', to_agent_id: 'agent-piper', handoff_type: 'dispatch', status: 'accepted', reason: 'Frontend implementation routed to Bravo.', source_kind: 'seed', source_label: 'local-seed', requested_at: iso(-270), accepted_at: iso(-265), completed_at: null, updated_at: iso(-265) },
      { id: 'handoff-2', task_id: 'task-runtime-adapter', from_agent_id: 'agent-rhea', to_agent_id: 'agent-omar', handoff_type: 'review', status: 'pending', reason: 'Awaiting runtime contract confirmation.', source_kind: 'seed', source_label: 'local-seed', requested_at: iso(-22), accepted_at: null, completed_at: null, updated_at: iso(-22) },
    ];
    handoffs.forEach((row) => insertTaskHandoff.run(row));

    [
      { agent_id: 'agent-charlie', source_kind: 'seed', source_label: 'local-seed', truth_status: 'seed', degraded_reason: 'Bootstrap/demo agent state.', current_job_id: 'task-overview', last_event_id: 'event-2', last_event_at: iso(-25), updated_at: now },
      { agent_id: 'agent-jules', source_kind: 'seed', source_label: 'local-seed', truth_status: 'seed', degraded_reason: 'Bootstrap/demo agent state.', current_job_id: 'task-triage', last_event_id: null, last_event_at: null, updated_at: now },
      { agent_id: 'agent-piper', source_kind: 'seed', source_label: 'local-seed', truth_status: 'seed', degraded_reason: 'Bootstrap/demo agent state.', current_job_id: 'task-ui-shell', last_event_id: 'event-4', last_event_at: iso(-3), updated_at: now },
      { agent_id: 'agent-cleo', source_kind: 'seed', source_label: 'local-seed', truth_status: 'seed', degraded_reason: 'Bootstrap/demo agent state.', current_job_id: null, last_event_id: null, last_event_at: null, updated_at: now },
      { agent_id: 'agent-rhea', source_kind: 'seed', source_label: 'local-seed', truth_status: 'seed', degraded_reason: 'Bootstrap/demo agent state.', current_job_id: 'task-api-mvp', last_event_id: 'event-1', last_event_at: iso(-6), updated_at: now },
      { agent_id: 'agent-omar', source_kind: 'seed', source_label: 'local-seed', truth_status: 'seed', degraded_reason: 'Bootstrap/demo agent state.', current_job_id: 'task-runtime-adapter', last_event_id: 'event-3', last_event_at: iso(-20), updated_at: now },
    ].forEach((row) => insertBoardAgentState.run(row));

    [
      { task_id: 'task-overview', source_kind: 'seed', source_label: 'local-seed', truth_status: 'seed', degraded_reason: 'Bootstrap/demo task.', active_handoff_id: null, last_transition_event_id: 'event-2', last_transition_at: iso(-25), updated_at: now },
      { task_id: 'task-triage', source_kind: 'seed', source_label: 'local-seed', truth_status: 'seed', degraded_reason: 'Bootstrap/demo task.', active_handoff_id: null, last_transition_event_id: null, last_transition_at: null, updated_at: now },
      { task_id: 'task-ui-shell', source_kind: 'seed', source_label: 'local-seed', truth_status: 'seed', degraded_reason: 'Bootstrap/demo task.', active_handoff_id: 'handoff-1', last_transition_event_id: 'event-4', last_transition_at: iso(-3), updated_at: now },
      { task_id: 'task-api-mvp', source_kind: 'seed', source_label: 'local-seed', truth_status: 'seed', degraded_reason: 'Bootstrap/demo task.', active_handoff_id: null, last_transition_event_id: 'event-1', last_transition_at: iso(-6), updated_at: now },
      { task_id: 'task-runtime-adapter', source_kind: 'seed', source_label: 'local-seed', truth_status: 'seed', degraded_reason: 'Bootstrap/demo task.', active_handoff_id: 'handoff-2', last_transition_event_id: 'event-3', last_transition_at: iso(-20), updated_at: now },
    ].forEach((row) => insertBoardTaskState.run(row));
  });

  txn();
}
