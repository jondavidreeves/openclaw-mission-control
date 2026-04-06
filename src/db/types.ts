export type TeamStatus = 'active' | 'paused' | 'archived';
export type AgentStatus = 'online' | 'offline' | 'idle' | 'busy' | 'error';
export type TaskStatus = 'queued' | 'ready' | 'in_progress' | 'blocked' | 'done' | 'cancelled';
export type TaskPriority = 'low' | 'normal' | 'high' | 'urgent';
export type EventSeverity = 'info' | 'warning' | 'error' | 'critical';

export type DbMigration = {
  version: number;
  name: string;
  sql: string;
};

export type MigrationRecord = {
  version: number;
  name: string;
  applied_at: string;
};

export type TeamRecord = {
  id: string;
  slug: string;
  name: string;
  status: TeamStatus;
  category: string | null;
  lead_agent_id: string | null;
  description: string | null;
  created_at: string;
  updated_at: string;
};

export type AgentRecord = {
  id: string;
  team_id: string | null;
  slug: string;
  name: string;
  role: string;
  status: AgentStatus;
  capacity: number;
  utilization_pct: number;
  current_task_id: string | null;
  last_heartbeat_at: string | null;
  created_at: string;
  updated_at: string;
};

export type TaskRecord = {
  id: string;
  team_id: string | null;
  owner_agent_id: string | null;
  source_ref: string | null;
  external_ref: string | null;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  queue_stage: string;
  blocked_reason: string | null;
  opened_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  due_at: string | null;
  created_at: string;
  updated_at: string;
};

export type EventRecord = {
  id: string;
  entity_type: string;
  entity_id: string;
  team_id: string | null;
  agent_id: string | null;
  task_id: string | null;
  source: string;
  event_type: string;
  severity: EventSeverity;
  title: string;
  detail: string | null;
  payload_json: string | null;
  occurred_at: string;
  created_at: string;
};

export type SourceSyncStateRecord = {
  source: string;
  cursor: string | null;
  last_synced_at: string | null;
  status: string;
  error_message: string | null;
  metadata_json: string | null;
  updated_at: string;
};

export type OverviewMetricRecord = {
  metric_key: string;
  metric_value: number;
  metric_unit: string | null;
  as_of: string;
  window_label: string;
  updated_at: string;
};
