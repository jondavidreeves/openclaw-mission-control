export type TeamConfigItem = {
  id: string;
  name: string;
  category: string;
  agents?: string[];
  match?: string;
};

export type PreviewCard = {
  eyebrow: string;
  title: string;
  detail: string;
  status?: string;
};

export type InspectorPayload = {
  kind: 'route' | 'item';
  title: string;
  subtitle: string;
  summary: string;
  fields: Array<{ label: string; value: string }>;
  actions?: string[];
};

export type NavIconName = 'overview' | 'teams' | 'agents' | 'tasks' | 'events' | 'settings' | 'factory' | 'pipeline' | 'roles' | 'activity';

export type PageDescriptor = {
  id: string;
  label: string;
  path: string;
  icon: NavIconName;
  section?: string;
  preview: PreviewCard;
  inspector: InspectorPayload;
};

export type ApiMetric = {
  key: string;
  label: string;
  value: number;
  unit: string | null;
  asOf: string;
  windowLabel: string;
};

export type ApiOverview = {
  generatedAt: string;
  metrics: ApiMetric[];
  summary: {
    teams: number;
    agents: number;
    onlineAgents: number;
    activeTasks: number;
    blockedTasks: number;
    events24h: number;
  };
  board: {
    truthStatus: 'live' | 'degraded' | 'seed_demo' | 'unavailable';
    sourceMode: string;
    degradedSources: number;
    pendingHandoffs: number;
    seedTasks: number;
    degradedTasks: number;
  };
  highlights: string[];
};

export type TeamFactoryFloorItem = {
  id: string;
  slug: string;
  name: string;
  status: string;
  category: string | null;
  agentCount: number;
  staffedCount: number;
  taskCount: number;
  blockedTaskCount: number;
  avgUtilizationPct: number;
  lastActivityAt: string | null;
};

export type TeamPipelineStage = {
  teamId: string;
  teamSlug: string | null;
  teamName: string | null;
  queueStage: string;
  taskCount: number;
  urgentTaskCount: number;
  blockedTaskCount: number;
  lastUpdatedAt: string | null;
};

export type TeamRoleCoverage = {
  teamId: string;
  teamSlug: string | null;
  teamName: string | null;
  role: string;
  staffedCount: number;
  availableCount: number;
  avgUtilizationPct: number;
};

export type TeamActivityPoint = {
  teamId: string;
  teamSlug: string | null;
  teamName: string | null;
  activityDate: string;
  eventCount: number;
  incidentCount: number;
  lastEventAt: string | null;
};

export type AgentListItem = {
  id: string;
  slug: string;
  name: string;
  role: string;
  status: string;
  capacity: number;
  utilizationPct: number;
  lastHeartbeatAt: string | null;
  updatedAt: string;
  truthStatus: 'live' | 'derived' | 'degraded' | 'seed' | 'unavailable' | 'seed_demo';
  sourceKind: string;
  sourceLabel: string;
  degradedReason: string | null;
  team: null | {
    id: string;
    slug: string;
    name: string;
  };
  currentTask: null | {
    id: string;
    title: string;
    status: string;
  };
};

export type TaskListItem = {
  id: string;
  title: string;
  status: string;
  priority: string;
  queueStage: string;
  blockedReason: string | null;
  sourceRef: string | null;
  externalRef: string | null;
  openedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  dueAt: string | null;
  updatedAt: string;
  truthStatus: 'live' | 'derived' | 'degraded' | 'seed' | 'unavailable' | 'seed_demo';
  sourceKind: string;
  sourceLabel: string;
  degradedReason: string | null;
  activeHandoffId: string | null;
  team: null | {
    id: string;
    slug: string;
    name: string;
  };
  owner: null | {
    id: string;
    slug: string;
    name: string;
  };
};

export type EventItem = {
  id: string;
  entityType: string;
  entityId: string;
  teamId: string | null;
  agentId: string | null;
  taskId: string | null;
  jobId?: string | null;
  ownerAgentId?: string | null;
  source: string;
  eventType: string;
  severity: string;
  title: string;
  detail: string | null;
  payload: unknown;
  occurredAt: string;
  createdAt: string;
  truthStatus: 'live' | 'derived' | 'degraded' | 'seed' | 'unavailable' | 'seed_demo';
  sourceKind?: string;
  sourceLabel?: string;
};

export type SettingItem = {
  key: string;
  value: unknown;
  category: string;
  source: 'seed' | 'derived' | 'runtime';
};

export type SourceStatus = {
  source: string;
  kind: 'local-seed' | 'local-db' | 'runtime-adapter';
  status: string;
  cursor: string | null;
  lastSyncedAt: string | null;
  errorMessage: string | null;
  metadata: unknown;
};

export type MissionControlBoardState = 'idle' | 'assigned' | 'running' | 'blocked' | 'waiting' | 'complete' | 'failed' | 'unavailable';

export type MissionControlBoardOrchestrator = {
  id: string;
  name: string;
  role: string;
  state: MissionControlBoardState;
  summary: string;
  activeDelegationCount: number;
  waitingCount: number;
  blockedCount: number;
  lastActiveAt: string | null;
  sessionKey: string;
  source: string;
  degraded: boolean;
};

export type MissionControlBoardTeam = {
  id: string;
  slug: string;
  name: string;
  category: string;
};

export type MissionControlBoardAgent = {
  id: string;
  name: string;
  role: string;
  teamId: string | null;
  state: MissionControlBoardState;
  statusLabel: string;
  activeJobId: string | null;
  activeJobTitle: string | null;
  lastActiveAt: string | null;
  heartbeatEvery: string | null;
  bootstrapPending: boolean;
  source: string;
  degraded: boolean;
};

export type MissionControlBoardJob = {
  id: string;
  sourceRunId: string | null;
  label: string;
  detail: string;
  ownerAgentId: string | null;
  assignedAgentId: string | null;
  state: MissionControlBoardState;
  status: string;
  createdAt: string;
  startedAt: string | null;
  updatedAt: string;
  endedAt: string | null;
  progressSummary: string | null;
  blockedReason: string | null;
  source: string;
};

export type MissionControlBoardHandoff = {
  id: string;
  fromAgentId: string;
  toAgentId: string;
  jobId: string;
  label: string;
  state: 'assigned' | 'accepted' | 'returned' | 'failed';
  occurredAt: string;
  source: string;
};

export type MissionControlBoardBlocker = {
  id: string;
  scope: 'flow' | 'task' | 'agent' | 'runtime';
  relatedId: string;
  severity: 'warning' | 'error' | 'critical';
  title: string;
  detail: string;
  occurredAt: string;
  source: string;
};

export type MissionControlBoardEvent = {
  id: string;
  type: string;
  severity: 'info' | 'warning' | 'error';
  title: string;
  detail: string;
  occurredAt: string;
  source: string;
  agentId: string | null;
  ownerAgentId: string | null;
  jobId: string | null;
  payload: unknown;
};

export type MissionControlBoard = {
  generatedAt: string;
  runtime: {
    source: string;
    status: 'ok' | 'degraded';
    degraded: boolean;
    unavailable: boolean;
    cursor: string | null;
    lastUpdatedAt: string | null;
    errorMessage: string | null;
    sources: Record<string, string>;
  };
  summary: {
    activeAgents: number;
    activeJobs: number;
    handoffs: number;
    blockers: number;
    failures: number;
    liveEvents: number;
  };
  teams: MissionControlBoardTeam[];
  orchestrator: MissionControlBoardOrchestrator;
  agents: MissionControlBoardAgent[];
  jobs: MissionControlBoardJob[];
  handoffs: MissionControlBoardHandoff[];
  blockers: MissionControlBoardBlocker[];
  events: MissionControlBoardEvent[];
};

export type StreamEnvelope<T = unknown> = {
  id: string;
  type: string;
  ts: string;
  payload: T;
};
