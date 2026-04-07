import { resolveDbPath } from '../db/config.js';
import { openDatabase } from '../db/connection.js';
import { getAppliedMigrations } from '../db/migrator.js';
import { seedMissionControl } from './seed.js';
import { OpenClawRuntimeTruthAdapter, loadTeamsConfig, saveTeamsConfig, type RuntimeTruthAdapter, type SourceAdapter, type TeamConfig } from './source-adapters.js';
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
      teams: board.teams.length,
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
    const board = this.getMissionControlBoard();
    return board.teams.map((team) => {
      const teamAgents = board.agents.filter((a) => a.teamId === team.id);
      const teamJobs = board.jobs.filter((j) => teamAgents.some((a) => a.id === j.assignedAgentId));
      const teamBlockers = board.blockers.filter((b) => teamAgents.some((a) => a.id === b.relatedId) || teamJobs.some((j) => j.id === b.relatedId));
      const staffed = teamAgents.filter((a) => ['running', 'idle'].includes(a.state));
      const utilizations: number[] = teamAgents.map((a) => a.state === 'running' ? 100 : a.state === 'idle' ? 20 : 0);
      const avgUtil = utilizations.length ? utilizations.reduce((s, v) => s + v, 0) / utilizations.length : 0;
      const lastActivity = teamAgents.map((a) => a.lastActiveAt).filter(Boolean).sort().reverse()[0] ?? null;
      return {
        id: team.id,
        slug: team.slug,
        name: team.name,
        status: staffed.length > 0 ? 'active' : 'idle',
        category: team.category,
        agentCount: teamAgents.length,
        staffedCount: staffed.length,
        taskCount: teamJobs.length,
        blockedTaskCount: teamBlockers.length,
        avgUtilizationPct: Math.round(avgUtil * 10) / 10,
        lastActivityAt: lastActivity,
      };
    });
  }

  getPipeline(): TeamPipelineStage[] {
    const board = this.getMissionControlBoard();
    const stages: TeamPipelineStage[] = [];
    for (const team of board.teams) {
      const teamAgents = board.agents.filter((a) => a.teamId === team.id);
      const teamJobs = board.jobs.filter((j) => teamAgents.some((a) => a.id === j.assignedAgentId));
      const byStage = new Map<string, typeof teamJobs>();
      for (const job of teamJobs) {
        const stage = job.state;
        if (!byStage.has(stage)) byStage.set(stage, []);
        byStage.get(stage)!.push(job);
      }
      for (const [stage, jobs] of byStage) {
        stages.push({
          teamId: team.id,
          teamSlug: team.slug,
          teamName: team.name,
          queueStage: stage,
          taskCount: jobs.length,
          urgentTaskCount: jobs.filter((j) => j.state === 'failed').length,
          blockedTaskCount: jobs.filter((j) => j.blockedReason).length,
          lastUpdatedAt: jobs.map((j) => j.updatedAt).sort().reverse()[0] ?? null,
        });
      }
    }
    return stages;
  }

  getRoleCoverage(): TeamRoleCoverage[] {
    const board = this.getMissionControlBoard();
    const coverage: TeamRoleCoverage[] = [];
    for (const team of board.teams) {
      const teamAgents = board.agents.filter((a) => a.teamId === team.id);
      const byRole = new Map<string, typeof teamAgents>();
      for (const agent of teamAgents) {
        if (!byRole.has(agent.role)) byRole.set(agent.role, []);
        byRole.get(agent.role)!.push(agent);
      }
      for (const [role, agents] of byRole) {
        const utilizations: number[] = agents.map((a) => a.state === 'running' ? 100 : a.state === 'idle' ? 20 : 0);
        coverage.push({
          teamId: team.id,
          teamSlug: team.slug,
          teamName: team.name,
          role,
          staffedCount: agents.length,
          availableCount: agents.filter((a) => ['running', 'idle'].includes(a.state)).length,
          avgUtilizationPct: Math.round((utilizations.reduce((s, v) => s + v, 0) / utilizations.length) * 10) / 10,
        });
      }
    }
    return coverage;
  }

  getActivity(): TeamActivityPoint[] {
    const board = this.getMissionControlBoard();
    const activity: TeamActivityPoint[] = [];
    for (const team of board.teams) {
      const teamAgents = board.agents.filter((a) => a.teamId === team.id);
      const teamEvents = board.events.filter((e) => teamAgents.some((a) => a.id === e.agentId || a.id === e.ownerAgentId));
      const byDate = new Map<string, typeof teamEvents>();
      for (const event of teamEvents) {
        const date = event.occurredAt.slice(0, 10);
        if (!byDate.has(date)) byDate.set(date, []);
        byDate.get(date)!.push(event);
      }
      for (const [date, events] of byDate) {
        activity.push({
          teamId: team.id,
          teamSlug: team.slug,
          teamName: team.name,
          activityDate: date,
          eventCount: events.length,
          incidentCount: events.filter((e) => ['warning', 'error'].includes(e.severity)).length,
          lastEventAt: events.map((e) => e.occurredAt).sort().reverse()[0] ?? null,
        });
      }
    }
    return activity.sort((a, b) => b.activityDate.localeCompare(a.activityDate));
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

  getTeamsConfig(): TeamConfig[] {
    return loadTeamsConfig();
  }

  createTeam(team: { name: string; category: string }): TeamConfig {
    const teams = loadTeamsConfig();
    const slug = team.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const id = `team-${slug}`;
    if (teams.some((t) => t.id === id)) throw new Error(`A department called "${team.name}" already exists. Please choose a different name.`);
    const entry: TeamConfig = { id, name: team.name, category: team.category, agents: [] };
    teams.push(entry);
    saveTeamsConfig(teams);
    return entry;
  }

  updateTeam(teamId: string, updates: { name?: string; category?: string }): TeamConfig {
    const teams = loadTeamsConfig();
    const team = teams.find((t) => t.id === teamId);
    if (!team) throw new Error(`That department could not be found. It may have been deleted.`);
    if (updates.name !== undefined) team.name = updates.name;
    if (updates.category !== undefined) team.category = updates.category;
    saveTeamsConfig(teams);
    return team;
  }

  deleteTeam(teamId: string): void {
    const teams = loadTeamsConfig();
    const index = teams.findIndex((t) => t.id === teamId);
    if (index === -1) throw new Error(`That department could not be found. It may have already been deleted.`);
    teams.splice(index, 1);
    saveTeamsConfig(teams);
  }

  assignAgentToTeam(agentId: string, teamId: string): void {
    const teams = loadTeamsConfig();
    const target = teams.find((t) => t.id === teamId);
    if (!target) throw new Error(`That department could not be found. It may have been deleted.`);
    // Remove agent from any existing explicit assignment
    for (const team of teams) {
      if (team.agents) {
        team.agents = team.agents.filter((a) => a !== agentId);
      }
    }
    if (!target.agents) target.agents = [];
    target.agents.push(agentId);
    saveTeamsConfig(teams);
  }

  unassignAgent(agentId: string): void {
    const teams = loadTeamsConfig();
    for (const team of teams) {
      if (team.agents) {
        team.agents = team.agents.filter((a) => a !== agentId);
      }
    }
    saveTeamsConfig(teams);
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
