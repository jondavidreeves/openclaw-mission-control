import { resolveDbPath } from '../db/config.js';
import { openDatabase } from '../db/connection.js';
import { getAppliedMigrations } from '../db/migrator.js';
import { seedMissionControl } from './seed.js';
import { OpenClawRuntimeTruthAdapter, type RuntimeTruthAdapter, type SourceAdapter } from './source-adapters.js';
import type {
  AgentDetail,
  AgentListItem,
  ApiHealth,
  ApiMetric,
  ApiOverview,
  EventItem,
  MissionControlBoard,
  SettingItem,
  SourceStatus,
  TaskDetail,
  TaskListItem,
  TeamActivityPoint,
  TeamFactoryFloorItem,
  TeamPipelineStage,
  TeamRoleCoverage,
} from './types.js';

function parseJson(value: string | null): unknown {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function humanizeKey(value: string): string {
  return value.replaceAll('_', ' ');
}

export class MissionControlService {
  private readonly db = openDatabase({ migrate: true });
  private readonly sourceAdapters: SourceAdapter[];
  private readonly runtimeAdapter: RuntimeTruthAdapter;

  constructor(runtimeAdapter: RuntimeTruthAdapter = new OpenClawRuntimeTruthAdapter(), sourceAdapters?: SourceAdapter[]) {
    this.runtimeAdapter = runtimeAdapter;
    this.sourceAdapters = sourceAdapters ?? [runtimeAdapter];

    if (process.env.MISSION_CONTROL_ENABLE_SEED === '1') {
      seedMissionControl(this.db);
    }
  }

  getHealth(): ApiHealth {
    const board = this.getMissionControlBoard();

    return {
      status: 'ok',
      service: 'mission-control-api',
      now: new Date().toISOString(),
      db: {
        path: resolveDbPath(),
        migrationsApplied: getAppliedMigrations(this.db).length,
      },
      stream: {
        enabled: true,
      },
      board: {
        truthStatus: this.getTruthStatus(board),
        sourceMode: board.runtime.source,
        allowSeedData: process.env.MISSION_CONTROL_ENABLE_SEED === '1',
      },
    };
  }

  getMissionControlBoard(): MissionControlBoard {
    return this.runtimeAdapter.getBoard() as MissionControlBoard;
  }

  getOverview(): ApiOverview {
    const board = this.getMissionControlBoard();
    const generatedAt = new Date().toISOString();
    const truthStatus = this.getTruthStatus(board);
    const summary = {
      teams: 0,
      agents: board.agents.length,
      onlineAgents: board.agents.filter((agent) => ['idle', 'running'].includes(agent.state)).length,
      activeTasks: board.jobs.length,
      blockedTasks: board.blockers.length,
      events24h: board.events.length,
    };

    const metrics: ApiMetric[] = [
      { key: 'teams_total', value: summary.teams, defaultWindowLabel: 'runtime-derived' },
      { key: 'agents_online', value: summary.onlineAgents, defaultWindowLabel: 'runtime-derived' },
      { key: 'tasks_active', value: summary.activeTasks, defaultWindowLabel: 'runtime-derived' },
      { key: 'tasks_blocked', value: summary.blockedTasks, defaultWindowLabel: 'runtime-derived' },
      { key: 'events_24h', value: summary.events24h, defaultWindowLabel: 'runtime-derived' },
      { key: 'handoffs_live', value: board.summary.handoffs, defaultWindowLabel: 'runtime-derived' },
      { key: 'runtime_failures', value: board.summary.failures, defaultWindowLabel: 'runtime-derived' },
    ].map(({ key, value, defaultWindowLabel }) => ({
      key,
      label: humanizeKey(key),
      value,
      unit: 'count',
      asOf: board.runtime.lastUpdatedAt ?? generatedAt,
      windowLabel: defaultWindowLabel,
    }));

    const highlights = [
      board.orchestrator.summary,
      `${board.summary.handoffs} live handoff${board.summary.handoffs === 1 ? '' : 's'} across ${board.summary.activeJobs} active job${board.summary.activeJobs === 1 ? '' : 's'}`,
    ];

    if (board.runtime.unavailable) {
      highlights.push('Runtime is reachable but no live operator state is currently available.');
    } else if (board.runtime.degraded) {
      highlights.push(`Runtime degraded: ${board.runtime.errorMessage ?? 'some OpenClaw sources are unavailable'}`);
    } else {
      highlights.push(`${summary.onlineAgents} agents visible from real OpenClaw runtime state`);
    }

    return {
      generatedAt,
      metrics,
      summary,
      board: {
        truthStatus,
        sourceMode: board.runtime.source,
        degradedSources: board.runtime.degraded ? 1 : 0,
        pendingHandoffs: board.summary.handoffs,
        seedTasks: 0,
        degradedTasks: board.summary.blockers,
      },
      highlights,
    };
  }

  getFactoryFloor(): TeamFactoryFloorItem[] {
    return [];
  }

  getPipeline(): TeamPipelineStage[] {
    return [];
  }

  getRoleCoverage(): TeamRoleCoverage[] {
    return [];
  }

  getActivity(): TeamActivityPoint[] {
    return [];
  }

  getAgents(): AgentListItem[] {
    const board = this.getMissionControlBoard();
    return [...board.agents]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((agent) => ({
        id: agent.id,
        slug: agent.id,
        name: agent.name,
        role: agent.role,
        status: agent.state,
        capacity: 1,
        utilizationPct: agent.state === 'running' ? 100 : agent.state === 'idle' ? 20 : 0,
        lastHeartbeatAt: agent.lastActiveAt,
        updatedAt: agent.lastActiveAt ?? board.generatedAt,
        truthStatus: agent.degraded ? 'degraded' : 'live',
        sourceKind: 'runtime-adapter',
        sourceLabel: agent.source,
        degradedReason: agent.degraded ? 'Runtime agent is currently unavailable or stale.' : null,
        team: null,
        currentTask: agent.activeJobId
          ? {
              id: agent.activeJobId,
              title: agent.activeJobTitle ?? 'Runtime delegation',
              status: agent.state,
            }
          : null,
      }));
  }

  getAgent(agentId: string): AgentDetail | null {
    const agent = this.getAgents().find((item) => item.id === agentId);
    if (!agent) return null;

    return {
      ...agent,
      tasks: this.getTasks().filter((task) => task.owner?.id === agentId),
      recentEvents: this.getEvents().filter((event) => event.agentId === agentId || event.entityId === agentId).slice(0, 20),
    };
  }

  getTasks(): TaskListItem[] {
    const board = this.getMissionControlBoard();
    const handoffByJobId = new Map(board.handoffs.map((handoff) => [handoff.jobId, handoff.id]));
    const ownerById = new Map(this.getAgents().map((agent) => [agent.id, agent]));

    return [...board.jobs]
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map((job) => ({
        id: job.id,
        title: job.label,
        status: job.status,
        priority: job.state === 'failed' ? 'urgent' : 'normal',
        queueStage: job.state,
        blockedReason: job.blockedReason,
        sourceRef: job.sourceRunId,
        externalRef: null,
        openedAt: job.createdAt,
        startedAt: job.startedAt,
        completedAt: job.endedAt,
        dueAt: null,
        updatedAt: job.updatedAt,
        truthStatus: job.state === 'failed' ? 'degraded' : 'live',
        sourceKind: 'runtime-adapter',
        sourceLabel: job.source,
        degradedReason: job.state === 'failed' ? 'Latest runtime state for this delegation is failed.' : null,
        activeHandoffId: handoffByJobId.get(job.id) ?? null,
        team: null,
        owner: job.assignedAgentId
          ? (() => {
              const ownerAgent = ownerById.get(job.assignedAgentId);
              return ownerAgent
                ? { id: ownerAgent.id, slug: ownerAgent.slug, name: ownerAgent.name }
                : { id: job.assignedAgentId, slug: job.assignedAgentId, name: job.assignedAgentId };
            })()
          : null,
      }));
  }

  getTask(taskId: string): TaskDetail | null {
    const task = this.getTasks().find((item) => item.id === taskId);
    if (!task) return null;

    const board = this.getMissionControlBoard();
    const boardJob = board.jobs.find((job) => job.id === taskId);
    return {
      ...task,
      description: boardJob?.detail ?? null,
      createdAt: boardJob?.createdAt ?? task.openedAt ?? task.updatedAt,
      recentEvents: this.getEvents().filter((event) => event.taskId === taskId || event.jobId === taskId || event.entityId === taskId).slice(0, 20),
    };
  }

  getEvents(): EventItem[] {
    const board = this.getMissionControlBoard();
    return [...board.events]
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
      .slice(0, 100)
      .map((event) => ({
        id: event.id,
        entityType: event.jobId ? 'task' : event.agentId ? 'agent' : 'runtime',
        entityId: event.jobId ?? event.agentId ?? event.ownerAgentId ?? 'runtime',
        teamId: null,
        agentId: event.agentId,
        taskId: event.jobId,
        jobId: event.jobId,
        ownerAgentId: event.ownerAgentId,
        source: event.source,
        eventType: event.type,
        severity: event.severity,
        title: event.title,
        detail: event.detail,
        payload: event.payload,
        occurredAt: event.occurredAt,
        createdAt: event.occurredAt,
        truthStatus: ['warning', 'error'].includes(event.severity) ? 'degraded' : 'live',
        sourceKind: 'runtime-adapter',
        sourceLabel: event.source,
      }));
  }

  getSettings(): SettingItem[] {
    const board = this.getMissionControlBoard();
    return [
      { key: 'runtime.ingestion.mode', value: board.runtime.source, category: 'runtime', source: 'runtime' },
      { key: 'runtime.truth.status', value: this.getTruthStatus(board), category: 'runtime', source: 'runtime' },
      { key: 'runtime.truth.degraded', value: board.runtime.degraded, category: 'runtime', source: 'runtime' },
      { key: 'runtime.truth.unavailable', value: board.runtime.unavailable, category: 'runtime', source: 'runtime' },
      { key: 'runtime.orchestrator.default', value: 'Charlie', category: 'runtime', source: 'derived' },
      { key: 'stream.transport', value: 'sse', category: 'api', source: 'derived' },
      { key: 'frontend.basePath', value: '/', category: 'frontend', source: 'derived' },
      { key: 'database.path', value: resolveDbPath(), category: 'storage', source: 'derived' },
    ];
  }

  async getSources(): Promise<SourceStatus[]> {
    const dbSources = this.db.prepare(`SELECT * FROM source_sync_state ORDER BY source ASC`).all() as Array<any>;
    const adapterStatuses = await Promise.all(this.sourceAdapters.map((adapter) => adapter.getStatus()));

    const fromDb: SourceStatus[] = dbSources.map((row) => ({
      source: row.source,
      kind: row.source === 'local-db' ? 'local-db' : 'local-seed',
      status: row.status,
      cursor: row.cursor,
      lastSyncedAt: row.last_synced_at,
      errorMessage: row.error_message,
      metadata: parseJson(row.metadata_json),
    }));

    const merged = new Map<string, SourceStatus>();
    [...fromDb, ...adapterStatuses].forEach((item) => merged.set(item.source, item));
    return Array.from(merged.values()).sort((a, b) => a.source.localeCompare(b.source));
  }

  getOperatorSnapshot() {
    return {
      overview: this.getOverview(),
      board: this.getMissionControlBoard(),
      agents: this.getAgents(),
      tasks: this.getTasks(),
      events: this.getEvents(),
      teams: {
        factoryFloor: this.getFactoryFloor(),
        pipeline: this.getPipeline(),
        roles: this.getRoleCoverage(),
        activity: this.getActivity(),
      },
    };
  }

  close(): void {
    this.db.close();
  }

  private getTruthStatus(board: MissionControlBoard): ApiOverview['board']['truthStatus'] {
    if (process.env.MISSION_CONTROL_ENABLE_SEED === '1') return 'seed_demo';
    if (board.runtime.unavailable) return 'unavailable';
    if (board.runtime.degraded) return 'degraded';
    return 'live';
  }
}
