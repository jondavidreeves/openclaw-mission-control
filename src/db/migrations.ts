import type { DbMigration } from './types.js';

export const migrations: DbMigration[] = [
  {
    version: 1,
    name: 'mvp_schema',
    sql: `
      CREATE TABLE IF NOT EXISTS teams (
        id TEXT PRIMARY KEY,
        slug TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('active', 'paused', 'archived')),
        category TEXT,
        lead_agent_id TEXT,
        description TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (lead_agent_id) REFERENCES agents(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS agents (
        id TEXT PRIMARY KEY,
        team_id TEXT,
        slug TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        role TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('online', 'offline', 'idle', 'busy', 'error')),
        capacity INTEGER NOT NULL DEFAULT 1 CHECK (capacity >= 0),
        utilization_pct REAL NOT NULL DEFAULT 0 CHECK (utilization_pct >= 0 AND utilization_pct <= 100),
        current_task_id TEXT,
        last_heartbeat_at TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE SET NULL,
        FOREIGN KEY (current_task_id) REFERENCES tasks(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        team_id TEXT,
        owner_agent_id TEXT,
        source_ref TEXT,
        external_ref TEXT,
        title TEXT NOT NULL,
        description TEXT,
        status TEXT NOT NULL CHECK (status IN ('queued', 'ready', 'in_progress', 'blocked', 'done', 'cancelled')),
        priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
        queue_stage TEXT NOT NULL DEFAULT 'intake',
        blocked_reason TEXT,
        opened_at TEXT,
        started_at TEXT,
        completed_at TEXT,
        due_at TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE SET NULL,
        FOREIGN KEY (owner_agent_id) REFERENCES agents(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        team_id TEXT,
        agent_id TEXT,
        task_id TEXT,
        source TEXT NOT NULL,
        event_type TEXT NOT NULL,
        severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'error', 'critical')),
        title TEXT NOT NULL,
        detail TEXT,
        payload_json TEXT,
        occurred_at TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE SET NULL,
        FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE SET NULL,
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS source_sync_state (
        source TEXT PRIMARY KEY,
        cursor TEXT,
        last_synced_at TEXT,
        status TEXT NOT NULL DEFAULT 'idle',
        error_message TEXT,
        metadata_json TEXT,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS overview_metrics (
        metric_key TEXT PRIMARY KEY,
        metric_value REAL NOT NULL,
        metric_unit TEXT,
        as_of TEXT NOT NULL,
        window_label TEXT NOT NULL DEFAULT 'live',
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_agents_team_status ON agents(team_id, status);
      CREATE INDEX IF NOT EXISTS idx_tasks_team_status_priority ON tasks(team_id, status, priority);
      CREATE INDEX IF NOT EXISTS idx_tasks_owner_status ON tasks(owner_agent_id, status);
      CREATE INDEX IF NOT EXISTS idx_events_entity ON events(entity_type, entity_id, occurred_at DESC);
      CREATE INDEX IF NOT EXISTS idx_events_team_occurred ON events(team_id, occurred_at DESC);
      CREATE INDEX IF NOT EXISTS idx_events_task_occurred ON events(task_id, occurred_at DESC);

      CREATE VIEW IF NOT EXISTS team_factory_floor_view AS
      SELECT
        t.id AS team_id,
        t.slug,
        t.name,
        t.status,
        t.category,
        COALESCE(agent_stats.agent_count, 0) AS agent_count,
        COALESCE(agent_stats.staffed_count, 0) AS staffed_count,
        COALESCE(task_stats.task_count, 0) AS task_count,
        COALESCE(task_stats.blocked_task_count, 0) AS blocked_task_count,
        ROUND(COALESCE(agent_stats.avg_utilization_pct, 0), 1) AS avg_utilization_pct,
        MAX(COALESCE(task_stats.last_task_activity_at, t.updated_at)) AS last_activity_at
      FROM teams t
      LEFT JOIN (
        SELECT
          team_id,
          COUNT(*) AS agent_count,
          SUM(CASE WHEN status IN ('online', 'idle', 'busy') THEN 1 ELSE 0 END) AS staffed_count,
          AVG(utilization_pct) AS avg_utilization_pct
        FROM agents
        GROUP BY team_id
      ) AS agent_stats ON agent_stats.team_id = t.id
      LEFT JOIN (
        SELECT
          team_id,
          COUNT(*) AS task_count,
          SUM(CASE WHEN status = 'blocked' THEN 1 ELSE 0 END) AS blocked_task_count,
          MAX(updated_at) AS last_task_activity_at
        FROM tasks
        GROUP BY team_id
      ) AS task_stats ON task_stats.team_id = t.id
      GROUP BY t.id, t.slug, t.name, t.status, t.category, agent_stats.agent_count, agent_stats.staffed_count, agent_stats.avg_utilization_pct, task_stats.task_count, task_stats.blocked_task_count, task_stats.last_task_activity_at;

      CREATE VIEW IF NOT EXISTS team_pipeline_view AS
      SELECT
        COALESCE(team_id, '__unassigned__') AS team_id,
        queue_stage,
        COUNT(*) AS task_count,
        SUM(CASE WHEN priority = 'urgent' THEN 1 ELSE 0 END) AS urgent_task_count,
        SUM(CASE WHEN status = 'blocked' THEN 1 ELSE 0 END) AS blocked_task_count,
        MAX(updated_at) AS last_updated_at
      FROM tasks
      GROUP BY COALESCE(team_id, '__unassigned__'), queue_stage;

      CREATE VIEW IF NOT EXISTS team_role_coverage_view AS
      SELECT
        COALESCE(team_id, '__unassigned__') AS team_id,
        role,
        COUNT(*) AS staffed_count,
        SUM(CASE WHEN status IN ('online', 'idle', 'busy') THEN 1 ELSE 0 END) AS available_count,
        ROUND(COALESCE(AVG(utilization_pct), 0), 1) AS avg_utilization_pct
      FROM agents
      GROUP BY COALESCE(team_id, '__unassigned__'), role;

      CREATE VIEW IF NOT EXISTS team_activity_view AS
      SELECT
        COALESCE(team_id, '__unassigned__') AS team_id,
        DATE(occurred_at) AS activity_date,
        COUNT(*) AS event_count,
        SUM(CASE WHEN severity IN ('error', 'critical') THEN 1 ELSE 0 END) AS incident_count,
        MAX(occurred_at) AS last_event_at
      FROM events
      GROUP BY COALESCE(team_id, '__unassigned__'), DATE(occurred_at);

      CREATE VIEW IF NOT EXISTS agent_list_view AS
      SELECT
        a.id AS agent_id,
        a.slug,
        a.name,
        a.role,
        a.status,
        a.capacity,
        a.utilization_pct,
        a.last_heartbeat_at,
        a.updated_at,
        t.id AS team_id,
        t.name AS team_name,
        t.slug AS team_slug,
        task.id AS current_task_id,
        task.title AS current_task_title,
        task.status AS current_task_status
      FROM agents a
      LEFT JOIN teams t ON t.id = a.team_id
      LEFT JOIN tasks task ON task.id = a.current_task_id;

      CREATE VIEW IF NOT EXISTS task_list_view AS
      SELECT
        task.id AS task_id,
        task.title,
        task.status,
        task.priority,
        task.queue_stage,
        task.blocked_reason,
        task.source_ref,
        task.external_ref,
        task.opened_at,
        task.started_at,
        task.completed_at,
        task.due_at,
        task.updated_at,
        t.id AS team_id,
        t.name AS team_name,
        t.slug AS team_slug,
        a.id AS owner_agent_id,
        a.name AS owner_agent_name,
        a.slug AS owner_agent_slug
      FROM tasks task
      LEFT JOIN teams t ON t.id = task.team_id
      LEFT JOIN agents a ON a.id = task.owner_agent_id;
    `,
  },
  {
    version: 2,
    name: 'fix_team_factory_floor_view_aggregation',
    sql: `
      DROP VIEW IF EXISTS team_factory_floor_view;

      CREATE VIEW team_factory_floor_view AS
      WITH agent_stats AS (
        SELECT
          team_id,
          COUNT(*) AS agent_count,
          SUM(CASE WHEN status IN ('online', 'idle', 'busy') THEN 1 ELSE 0 END) AS staffed_count,
          AVG(utilization_pct) AS avg_utilization_pct,
          MAX(COALESCE(last_heartbeat_at, updated_at)) AS last_agent_activity_at
        FROM agents
        GROUP BY team_id
      ),
      task_stats AS (
        SELECT
          team_id,
          COUNT(*) AS task_count,
          SUM(CASE WHEN status = 'blocked' THEN 1 ELSE 0 END) AS blocked_task_count,
          MAX(updated_at) AS last_task_activity_at
        FROM tasks
        GROUP BY team_id
      )
      SELECT
        t.id AS team_id,
        t.slug,
        t.name,
        t.status,
        t.category,
        COALESCE(agent_stats.agent_count, 0) AS agent_count,
        COALESCE(agent_stats.staffed_count, 0) AS staffed_count,
        COALESCE(task_stats.task_count, 0) AS task_count,
        COALESCE(task_stats.blocked_task_count, 0) AS blocked_task_count,
        ROUND(COALESCE(agent_stats.avg_utilization_pct, 0), 1) AS avg_utilization_pct,
        MAX(COALESCE(task_stats.last_task_activity_at, agent_stats.last_agent_activity_at, t.updated_at)) AS last_activity_at
      FROM teams t
      LEFT JOIN agent_stats ON agent_stats.team_id = t.id
      LEFT JOIN task_stats ON task_stats.team_id = t.id
      GROUP BY
        t.id,
        t.slug,
        t.name,
        t.status,
        t.category,
        agent_stats.agent_count,
        agent_stats.staffed_count,
        agent_stats.avg_utilization_pct,
        agent_stats.last_agent_activity_at,
        task_stats.task_count,
        task_stats.blocked_task_count,
        task_stats.last_task_activity_at;
    `,
  },
  {
    version: 3,
    name: 'board_truth_read_models',
    sql: `
      CREATE TABLE IF NOT EXISTS board_config (
        id TEXT PRIMARY KEY,
        board_name TEXT NOT NULL,
        orchestrator_agent_id TEXT,
        source_mode TEXT NOT NULL DEFAULT 'live_only' CHECK (source_mode IN ('live_only', 'live_with_degraded_fallback', 'seed_demo')),
        allow_seed_data INTEGER NOT NULL DEFAULT 0 CHECK (allow_seed_data IN (0, 1)),
        generated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        degraded_reason TEXT,
        FOREIGN KEY (orchestrator_agent_id) REFERENCES agents(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS board_agent_state (
        agent_id TEXT PRIMARY KEY,
        source_kind TEXT NOT NULL CHECK (source_kind IN ('runtime', 'operator', 'github', 'seed', 'derived', 'unknown')),
        source_label TEXT NOT NULL,
        truth_status TEXT NOT NULL CHECK (truth_status IN ('live', 'derived', 'degraded', 'seed')),
        degraded_reason TEXT,
        current_job_id TEXT,
        last_event_id TEXT,
        last_event_at TEXT,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE,
        FOREIGN KEY (current_job_id) REFERENCES tasks(id) ON DELETE SET NULL,
        FOREIGN KEY (last_event_id) REFERENCES events(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS board_task_state (
        task_id TEXT PRIMARY KEY,
        source_kind TEXT NOT NULL CHECK (source_kind IN ('runtime', 'operator', 'github', 'seed', 'derived', 'unknown')),
        source_label TEXT NOT NULL,
        truth_status TEXT NOT NULL CHECK (truth_status IN ('live', 'derived', 'degraded', 'seed')),
        degraded_reason TEXT,
        active_handoff_id TEXT,
        last_transition_event_id TEXT,
        last_transition_at TEXT,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
        FOREIGN KEY (last_transition_event_id) REFERENCES events(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS task_handoffs (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        from_agent_id TEXT,
        to_agent_id TEXT,
        handoff_type TEXT NOT NULL DEFAULT 'assignment',
        status TEXT NOT NULL CHECK (status IN ('pending', 'accepted', 'completed', 'cancelled')),
        reason TEXT,
        source_kind TEXT NOT NULL CHECK (source_kind IN ('runtime', 'operator', 'github', 'seed', 'derived', 'unknown')),
        source_label TEXT NOT NULL,
        requested_at TEXT NOT NULL,
        accepted_at TEXT,
        completed_at TEXT,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
        FOREIGN KEY (from_agent_id) REFERENCES agents(id) ON DELETE SET NULL,
        FOREIGN KEY (to_agent_id) REFERENCES agents(id) ON DELETE SET NULL
      );

      CREATE INDEX IF NOT EXISTS idx_board_agent_state_truth ON board_agent_state(truth_status, source_kind);
      CREATE INDEX IF NOT EXISTS idx_board_task_state_truth ON board_task_state(truth_status, source_kind);
      CREATE INDEX IF NOT EXISTS idx_task_handoffs_task_requested ON task_handoffs(task_id, requested_at DESC);
      CREATE INDEX IF NOT EXISTS idx_task_handoffs_status ON task_handoffs(status, requested_at DESC);

      INSERT OR IGNORE INTO board_config (id, board_name, source_mode, allow_seed_data)
      VALUES ('mission-control', 'Mission Control', 'live_only', 0);

      DROP VIEW IF EXISTS orchestrator_board_view;
      CREATE VIEW orchestrator_board_view AS
      SELECT
        cfg.id AS board_id,
        cfg.board_name,
        cfg.source_mode,
        cfg.allow_seed_data,
        cfg.generated_at,
        cfg.degraded_reason AS board_degraded_reason,
        a.id AS orchestrator_agent_id,
        a.slug AS orchestrator_slug,
        a.name AS orchestrator_name,
        a.role AS orchestrator_role,
        a.status AS orchestrator_status,
        a.current_task_id AS orchestrator_task_id,
        task.title AS orchestrator_task_title,
        task.status AS orchestrator_task_status,
        COALESCE(ast.source_kind, 'unknown') AS source_kind,
        COALESCE(ast.source_label, 'untracked') AS source_label,
        COALESCE(ast.truth_status, CASE WHEN cfg.allow_seed_data = 1 THEN 'seed' ELSE 'degraded' END) AS truth_status,
        COALESCE(ast.degraded_reason, cfg.degraded_reason) AS degraded_reason,
        ast.last_event_at,
        ast.updated_at AS state_updated_at
      FROM board_config cfg
      LEFT JOIN agents a ON a.id = cfg.orchestrator_agent_id
      LEFT JOIN tasks task ON task.id = a.current_task_id
      LEFT JOIN board_agent_state ast ON ast.agent_id = a.id;

      DROP VIEW IF EXISTS agent_board_view;
      CREATE VIEW agent_board_view AS
      SELECT
        a.id AS agent_id,
        a.slug,
        a.name,
        a.role,
        a.status,
        a.capacity,
        a.utilization_pct,
        a.last_heartbeat_at,
        a.updated_at,
        t.id AS team_id,
        t.slug AS team_slug,
        t.name AS team_name,
        current_task.id AS current_task_id,
        current_task.title AS current_task_title,
        current_task.status AS current_task_status,
        COALESCE(ast.source_kind, 'derived') AS source_kind,
        COALESCE(ast.source_label, CASE WHEN a.id IS NULL THEN 'untracked' ELSE 'agent-table' END) AS source_label,
        COALESCE(ast.truth_status, 'derived') AS truth_status,
        ast.degraded_reason,
        ast.last_event_id,
        ast.last_event_at,
        ast.updated_at AS state_updated_at
      FROM agents a
      LEFT JOIN teams t ON t.id = a.team_id
      LEFT JOIN board_agent_state ast ON ast.agent_id = a.id
      LEFT JOIN tasks current_task ON current_task.id = COALESCE(ast.current_job_id, a.current_task_id);

      DROP VIEW IF EXISTS task_board_view;
      CREATE VIEW task_board_view AS
      SELECT
        task.id AS task_id,
        task.title,
        task.status,
        task.priority,
        task.queue_stage,
        task.blocked_reason,
        task.source_ref,
        task.external_ref,
        task.opened_at,
        task.started_at,
        task.completed_at,
        task.due_at,
        task.updated_at,
        team.id AS team_id,
        team.slug AS team_slug,
        team.name AS team_name,
        owner.id AS owner_agent_id,
        owner.slug AS owner_agent_slug,
        owner.name AS owner_agent_name,
        COALESCE(tst.source_kind, 'derived') AS source_kind,
        COALESCE(tst.source_label, CASE WHEN task.source_ref IS NOT NULL THEN task.source_ref ELSE 'task-table' END) AS source_label,
        COALESCE(tst.truth_status, CASE WHEN task.source_ref LIKE 'local:seed%' THEN 'seed' ELSE 'derived' END) AS truth_status,
        COALESCE(tst.degraded_reason, CASE WHEN task.source_ref LIKE 'local:seed%' THEN 'Seed/demo task is not operator truth.' ELSE NULL END) AS degraded_reason,
        tst.active_handoff_id,
        tst.last_transition_event_id,
        tst.last_transition_at,
        tst.updated_at AS state_updated_at
      FROM tasks task
      LEFT JOIN teams team ON team.id = task.team_id
      LEFT JOIN agents owner ON owner.id = task.owner_agent_id
      LEFT JOIN board_task_state tst ON tst.task_id = task.id;

      DROP VIEW IF EXISTS handoff_board_view;
      CREATE VIEW handoff_board_view AS
      SELECT
        h.id AS handoff_id,
        h.task_id,
        task.title AS task_title,
        h.from_agent_id,
        fa.name AS from_agent_name,
        h.to_agent_id,
        ta.name AS to_agent_name,
        h.handoff_type,
        h.status,
        h.reason,
        h.source_kind,
        h.source_label,
        h.requested_at,
        h.accepted_at,
        h.completed_at,
        h.updated_at,
        task.team_id,
        team.slug AS team_slug,
        team.name AS team_name
      FROM task_handoffs h
      JOIN tasks task ON task.id = h.task_id
      LEFT JOIN teams team ON team.id = task.team_id
      LEFT JOIN agents fa ON fa.id = h.from_agent_id
      LEFT JOIN agents ta ON ta.id = h.to_agent_id;

      DROP VIEW IF EXISTS event_timeline_view;
      CREATE VIEW event_timeline_view AS
      SELECT
        e.id,
        e.entity_type,
        e.entity_id,
        e.team_id,
        e.agent_id,
        e.task_id,
        e.source,
        e.event_type,
        e.severity,
        e.title,
        e.detail,
        e.payload_json,
        e.occurred_at,
        e.created_at,
        team.slug AS team_slug,
        team.name AS team_name,
        agent.name AS agent_name,
        task.title AS task_title,
        CASE
          WHEN e.source = 'runtime' THEN 'live'
          WHEN e.source = 'operator' THEN 'live'
          WHEN e.source = 'github' THEN 'derived'
          WHEN e.source = 'seed' THEN 'seed'
          ELSE 'derived'
        END AS truth_status
      FROM events e
      LEFT JOIN teams team ON team.id = e.team_id
      LEFT JOIN agents agent ON agent.id = e.agent_id
      LEFT JOIN tasks task ON task.id = e.task_id;

      DROP VIEW IF EXISTS mission_control_board_view;
      CREATE VIEW mission_control_board_view AS
      WITH source_rollup AS (
        SELECT
          COUNT(*) AS total_sources,
          SUM(CASE WHEN status IN ('ok', 'live', 'healthy') THEN 1 ELSE 0 END) AS healthy_sources,
          SUM(CASE WHEN status IN ('error', 'degraded', 'not_configured', 'offline', 'stale') THEN 1 ELSE 0 END) AS degraded_sources,
          MAX(last_synced_at) AS last_synced_at
        FROM source_sync_state
      ),
      task_rollup AS (
        SELECT
          COUNT(*) AS total_tasks,
          SUM(CASE WHEN status IN ('queued', 'ready', 'in_progress', 'blocked') THEN 1 ELSE 0 END) AS open_tasks,
          SUM(CASE WHEN status = 'blocked' THEN 1 ELSE 0 END) AS blocked_tasks,
          SUM(CASE WHEN truth_status = 'seed' THEN 1 ELSE 0 END) AS seed_tasks,
          SUM(CASE WHEN truth_status = 'degraded' THEN 1 ELSE 0 END) AS degraded_tasks
        FROM task_board_view
      ),
      agent_rollup AS (
        SELECT
          COUNT(*) AS total_agents,
          SUM(CASE WHEN status IN ('online', 'idle', 'busy') THEN 1 ELSE 0 END) AS staffed_agents,
          SUM(CASE WHEN truth_status = 'seed' THEN 1 ELSE 0 END) AS seed_agents,
          SUM(CASE WHEN truth_status = 'degraded' THEN 1 ELSE 0 END) AS degraded_agents
        FROM agent_board_view
      ),
      handoff_rollup AS (
        SELECT
          COUNT(*) AS total_handoffs,
          SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending_handoffs
        FROM task_handoffs
      )
      SELECT
        cfg.id AS board_id,
        cfg.board_name,
        cfg.source_mode,
        cfg.allow_seed_data,
        cfg.generated_at,
        cfg.degraded_reason,
        source_rollup.total_sources,
        source_rollup.healthy_sources,
        source_rollup.degraded_sources,
        source_rollup.last_synced_at,
        agent_rollup.total_agents,
        agent_rollup.staffed_agents,
        agent_rollup.seed_agents,
        agent_rollup.degraded_agents,
        task_rollup.total_tasks,
        task_rollup.open_tasks,
        task_rollup.blocked_tasks,
        task_rollup.seed_tasks,
        task_rollup.degraded_tasks,
        handoff_rollup.total_handoffs,
        handoff_rollup.pending_handoffs,
        CASE
          WHEN cfg.allow_seed_data = 1 THEN 'seed_demo'
          WHEN COALESCE(source_rollup.total_sources, 0) = 0 THEN 'degraded'
          WHEN COALESCE(source_rollup.degraded_sources, 0) > 0 THEN 'degraded'
          ELSE 'live'
        END AS board_truth_status
      FROM board_config cfg
      LEFT JOIN source_rollup ON 1 = 1
      LEFT JOIN task_rollup ON 1 = 1
      LEFT JOIN agent_rollup ON 1 = 1
      LEFT JOIN handoff_rollup ON 1 = 1;
    `,
  },
  {
    version: 4,
    name: 'backfill_board_truth_state_for_existing_rows',
    sql: `
      UPDATE board_config
      SET source_mode = CASE
            WHEN EXISTS (SELECT 1 FROM tasks WHERE source_ref LIKE 'local:seed%') THEN 'live_with_degraded_fallback'
            ELSE source_mode
          END,
          allow_seed_data = CASE
            WHEN EXISTS (SELECT 1 FROM tasks WHERE source_ref LIKE 'local:seed%') THEN 1
            ELSE allow_seed_data
          END,
          degraded_reason = CASE
            WHEN EXISTS (SELECT 1 FROM tasks WHERE source_ref LIKE 'local:seed%') THEN 'Existing local seed/bootstrap rows detected in board state.'
            ELSE degraded_reason
          END
      WHERE id = 'mission-control';

      INSERT OR IGNORE INTO board_agent_state (agent_id, source_kind, source_label, truth_status, degraded_reason, current_job_id, updated_at)
      SELECT
        a.id,
        CASE WHEN EXISTS (SELECT 1 FROM tasks t WHERE t.id = a.current_task_id AND t.source_ref LIKE 'local:seed%') THEN 'seed' ELSE 'derived' END,
        CASE WHEN EXISTS (SELECT 1 FROM tasks t WHERE t.id = a.current_task_id AND t.source_ref LIKE 'local:seed%') THEN 'local-seed' ELSE 'agent-table' END,
        CASE WHEN EXISTS (SELECT 1 FROM tasks t WHERE t.id = a.current_task_id AND t.source_ref LIKE 'local:seed%') THEN 'seed' ELSE 'derived' END,
        CASE WHEN EXISTS (SELECT 1 FROM tasks t WHERE t.id = a.current_task_id AND t.source_ref LIKE 'local:seed%') THEN 'Backfilled bootstrap/demo agent state.' ELSE NULL END,
        a.current_task_id,
        COALESCE(a.updated_at, CURRENT_TIMESTAMP)
      FROM agents a;

      INSERT OR IGNORE INTO board_task_state (task_id, source_kind, source_label, truth_status, degraded_reason, updated_at)
      SELECT
        t.id,
        CASE WHEN t.source_ref LIKE 'local:seed%' THEN 'seed' ELSE 'derived' END,
        CASE WHEN t.source_ref LIKE 'local:seed%' THEN 'local-seed' ELSE COALESCE(t.source_ref, 'task-table') END,
        CASE WHEN t.source_ref LIKE 'local:seed%' THEN 'seed' ELSE 'derived' END,
        CASE WHEN t.source_ref LIKE 'local:seed%' THEN 'Backfilled bootstrap/demo task state.' ELSE NULL END,
        COALESCE(t.updated_at, CURRENT_TIMESTAMP)
      FROM tasks t;

      UPDATE board_task_state
      SET source_kind = CASE WHEN EXISTS (SELECT 1 FROM tasks t WHERE t.id = board_task_state.task_id AND t.source_ref LIKE 'local:seed%') THEN 'seed' ELSE source_kind END,
          source_label = CASE WHEN EXISTS (SELECT 1 FROM tasks t WHERE t.id = board_task_state.task_id AND t.source_ref LIKE 'local:seed%') THEN 'local-seed' ELSE source_label END,
          truth_status = CASE WHEN EXISTS (SELECT 1 FROM tasks t WHERE t.id = board_task_state.task_id AND t.source_ref LIKE 'local:seed%') THEN 'seed' ELSE truth_status END,
          degraded_reason = CASE WHEN EXISTS (SELECT 1 FROM tasks t WHERE t.id = board_task_state.task_id AND t.source_ref LIKE 'local:seed%') THEN 'Backfilled bootstrap/demo task state.' ELSE degraded_reason END;

      UPDATE board_agent_state
      SET source_kind = CASE WHEN EXISTS (SELECT 1 FROM tasks t WHERE t.id = board_agent_state.current_job_id AND t.source_ref LIKE 'local:seed%') THEN 'seed' ELSE source_kind END,
          source_label = CASE WHEN EXISTS (SELECT 1 FROM tasks t WHERE t.id = board_agent_state.current_job_id AND t.source_ref LIKE 'local:seed%') THEN 'local-seed' ELSE source_label END,
          truth_status = CASE WHEN EXISTS (SELECT 1 FROM tasks t WHERE t.id = board_agent_state.current_job_id AND t.source_ref LIKE 'local:seed%') THEN 'seed' ELSE truth_status END,
          degraded_reason = CASE WHEN EXISTS (SELECT 1 FROM tasks t WHERE t.id = board_agent_state.current_job_id AND t.source_ref LIKE 'local:seed%') THEN 'Backfilled bootstrap/demo agent state.' ELSE degraded_reason END;
    `,
  },
];
