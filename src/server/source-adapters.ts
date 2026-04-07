import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import type {
  MissionControlBoard,
  MissionControlBoardAgent,
  MissionControlBoardBlocker,
  MissionControlBoardEvent,
  MissionControlBoardHandoff,
  MissionControlBoardJob,
  MissionControlBoardOrchestrator,
  MissionControlBoardTeam,
  SourceStatus,
} from './types.js';

export interface SourceAdapter {
  readonly source: string;
  getStatus(): SourceStatus;
}

export interface RuntimeTruthAdapter extends SourceAdapter {
  getBoard(): MissionControlBoard;
}

type OpenClawConfig = {
  gateway?: {
    mode?: string;
    port?: number;
    bind?: string;
  };
  agents?: {
    defaults?: {
      workspace?: string;
      model?: {
        primary?: string;
      };
    };
    list?: Array<{
      id: string;
      name?: string;
      workspace?: string;
      heartbeat?: {
        every?: string;
      };
      identity?: {
        name?: string;
      };
      model?: string;
    }>;
  };
};

type SessionIndexEntry = {
  sessionId?: string;
  updatedAt?: number;
  systemSent?: boolean;
  abortedLastRun?: boolean;
  chatType?: string;
  lastChannel?: string;
};

type TaskRunRow = {
  task_id: string;
  runtime: string;
  source_id: string | null;
  owner_key: string;
  child_session_key: string | null;
  parent_flow_id: string | null;
  run_id: string | null;
  label: string | null;
  task: string;
  status: string;
  delivery_status: string;
  notify_policy: string;
  created_at: number;
  started_at: number | null;
  ended_at: number | null;
  last_event_at: number | null;
  error: string | null;
  progress_summary: string | null;
  terminal_summary: string | null;
  terminal_outcome: string | null;
};

type FlowRunRow = {
  flow_id: string;
  owner_key: string;
  status: string;
  goal: string;
  current_step: string | null;
  blocked_task_id: string | null;
  blocked_summary: string | null;
  created_at: number;
  updated_at: number;
  ended_at: number | null;
};

const OPENCLAW_STATE_DIR = process.env.OPENCLAW_STATE_DIR || path.join(os.homedir(), '.openclaw');
const ACTIVE_AGENT_MS = 20 * 60 * 1000;
const STALE_AGENT_MS = 2 * 60 * 60 * 1000;
const RECENT_EVENT_LIMIT = 40;
const ACTIVE_JOB_LIMIT = 24;
const HANDOFF_LIMIT = 24;
const BLOCKER_LIMIT = 16;

function fileExists(filePath: string): boolean {
  try {
    fs.accessSync(filePath, fs.constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

function readJsonFile<T>(filePath: string): T | null {
  if (!fileExists(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
  } catch {
    return null;
  }
}

function millisToIso(value: number | null | undefined): string | null {
  return typeof value === 'number' && Number.isFinite(value) ? new Date(value).toISOString() : null;
}

function agentIdFromSessionKey(sessionKey: string | null | undefined): string | null {
  if (!sessionKey) return null;
  const match = /^agent:([^:]+):/.exec(sessionKey);
  return match?.[1] ?? null;
}

function titleFromTaskText(task: string | null | undefined): string {
  if (!task) return 'Untitled runtime task';
  const firstLine = task.split('\n')[0]?.trim() ?? '';
  return firstLine.length > 160 ? `${firstLine.slice(0, 157)}…` : firstLine;
}

function summarizeTask(task: TaskRunRow): string {
  return task.label ?? titleFromTaskText(task.task);
}

function defaultNameFromAgentId(agentId: string): string {
  switch (agentId) {
    case 'main':
      return 'Charlie';
    case 'architect':
      return 'Architect';
    case 'backend-dev':
      return 'Backend Developer';
    case 'frontend-dev':
      return 'Frontend Developer';
    case 'database-dev':
      return 'Database Developer';
    case 'qa-engineer':
      return 'QA Engineer';
    case 'security-reviewer':
      return 'Security Reviewer';
    default:
      return agentId;
  }
}

function roleFromAgentId(agentId: string): string {
  switch (agentId) {
    case 'main':
      return 'PM / Orchestrator';
    case 'architect':
      return 'Architect';
    case 'backend-dev':
      return 'Backend Developer';
    case 'frontend-dev':
      return 'Frontend Developer';
    case 'database-dev':
      return 'Database Developer';
    case 'qa-engineer':
      return 'QA Engineer';
    case 'security-reviewer':
      return 'Security Reviewer';
    default:
      return 'OpenClaw Agent';
  }
}

export type TeamConfig = {
  id: string;
  name: string;
  category: string;
  agents?: string[];
  match?: string;
};

const UNASSIGNED_TEAM: MissionControlBoardTeam = { id: 'team-unassigned', slug: 'unassigned', name: 'Unassigned', category: 'general' };

const TEAMS_CONFIG_PATH = path.join(process.cwd(), 'data', 'teams.json');

export function loadTeamsConfig(): TeamConfig[] {
  const data = readJsonFile<TeamConfig[]>(TEAMS_CONFIG_PATH);
  return data ?? [];
}

export function saveTeamsConfig(teams: TeamConfig[]): void {
  fs.mkdirSync(path.dirname(TEAMS_CONFIG_PATH), { recursive: true });
  fs.writeFileSync(TEAMS_CONFIG_PATH, JSON.stringify(teams, null, 2) + '\n', 'utf8');
}

function slugFromId(id: string): string {
  return id.replace(/^team-/, '');
}

function matchesPattern(agentId: string, pattern: string): boolean {
  if (pattern.endsWith('*')) {
    return agentId.startsWith(pattern.slice(0, -1));
  }
  return agentId === pattern;
}

function buildTeamLookup(teamsConfig: TeamConfig[]): (agentId: string) => MissionControlBoardTeam {
  const agentToTeam = new Map<string, MissionControlBoardTeam>();
  const patterns: Array<{ pattern: string; team: MissionControlBoardTeam }> = [];

  for (const config of teamsConfig) {
    const team: MissionControlBoardTeam = { id: config.id, slug: slugFromId(config.id), name: config.name, category: config.category };
    if (config.agents) {
      for (const agentId of config.agents) {
        agentToTeam.set(agentId, team);
      }
    }
    if (config.match) {
      patterns.push({ pattern: config.match, team });
    }
  }

  return (agentId: string) => {
    const direct = agentToTeam.get(agentId);
    if (direct) return direct;
    for (const { pattern, team } of patterns) {
      if (matchesPattern(agentId, pattern)) return team;
    }
    return UNASSIGNED_TEAM;
  };
}

export class OpenClawRuntimeTruthAdapter implements RuntimeTruthAdapter {
  readonly source = 'openclaw-runtime';

  getStatus(): SourceStatus {
    const board = this.getBoard();
    return {
      source: this.source,
      kind: 'runtime-adapter',
      status: board.runtime.status,
      cursor: board.runtime.cursor,
      lastSyncedAt: board.runtime.lastUpdatedAt,
      errorMessage: board.runtime.errorMessage,
      metadata: {
        activeAgents: board.summary.activeAgents,
        activeJobs: board.summary.activeJobs,
        blockers: board.summary.blockers,
        degraded: board.runtime.degraded,
        sources: board.runtime.sources,
      },
    };
  }

  getBoard(): MissionControlBoard {
    const configPath = path.join(OPENCLAW_STATE_DIR, 'openclaw.json');
    const tasksDbPath = path.join(OPENCLAW_STATE_DIR, 'tasks', 'runs.sqlite');
    const flowsDbPath = path.join(OPENCLAW_STATE_DIR, 'flows', 'registry.sqlite');
    const config = readJsonFile<OpenClawConfig>(configPath);
    const sessionsByAgent = this.loadSessionsByAgent();
    const taskRuns = this.loadTaskRuns(tasksDbPath);
    const flowRuns = this.loadFlowRuns(flowsDbPath);
    const now = Date.now();

    const activeTaskRuns = taskRuns.filter((task) => task.status === 'running');
    const failureTaskRuns = taskRuns.filter((task) => ['failed', 'timed_out', 'lost', 'cancelled'].includes(task.status));
    const recentTaskRuns = [...taskRuns]
      .sort((a, b) => (b.last_event_at ?? b.ended_at ?? b.started_at ?? b.created_at) - (a.last_event_at ?? a.ended_at ?? a.started_at ?? a.created_at))
      .slice(0, RECENT_EVENT_LIMIT);

    const agentConfigs = config?.agents?.list ?? [{ id: 'main' }];
    const teamsConfig = loadTeamsConfig();
    const resolveTeam = buildTeamLookup(teamsConfig);
    const teamsMap = new Map<string, MissionControlBoardTeam>();
    const agents = agentConfigs.map((agentConfig) => {
      const agentId = agentConfig.id;
      const team = resolveTeam(agentId);
      if (!teamsMap.has(team.id)) teamsMap.set(team.id, team);
      const sessionIndex = sessionsByAgent.get(agentId);
      const runningTask = activeTaskRuns.find((task) => agentIdFromSessionKey(task.child_session_key) === agentId && task.runtime === 'subagent');
      const delegatedTask = activeTaskRuns.find((task) => task.runtime === 'subagent' && agentIdFromSessionKey(task.child_session_key) === agentId);
      const lastActiveAt = sessionIndex?.updatedAt ?? delegatedTask?.last_event_at ?? delegatedTask?.started_at ?? null;
      const ageMs = typeof lastActiveAt === 'number' ? now - lastActiveAt : null;
      const stale = ageMs !== null && ageMs > STALE_AGENT_MS;
      const active = ageMs !== null && ageMs <= ACTIVE_AGENT_MS;
      let state: MissionControlBoardAgent['state'] = 'unavailable';
      if (agentId === 'main' && activeTaskRuns.some((task) => task.owner_key === 'agent:main:main' && task.runtime === 'subagent')) state = 'running';
      else if (runningTask || delegatedTask) state = 'running';
      else if (active) state = 'idle';
      else if (stale) state = 'waiting';
      else if (sessionIndex) state = 'idle';

      return {
        id: agentId,
        name: agentConfig.identity?.name ?? agentConfig.name ?? defaultNameFromAgentId(agentId),
        role: roleFromAgentId(agentId),
        teamId: team.id,
        state,
        statusLabel:
          state === 'running'
            ? 'running delegated work'
            : state === 'idle'
              ? 'available'
              : state === 'waiting'
                ? 'waiting / quiet'
                : 'unavailable',
        activeJobId: delegatedTask?.task_id ?? null,
        activeJobTitle: delegatedTask ? summarizeTask(delegatedTask) : null,
        lastActiveAt: millisToIso(lastActiveAt),
        heartbeatEvery: agentConfig.heartbeat?.every ?? null,
        bootstrapPending: !sessionIndex,
        source: 'openclaw-runtime',
        degraded: state === 'unavailable',
      } satisfies MissionControlBoardAgent;
    });
    // Ensure all configured teams appear, even those with no agents yet
    for (const config of teamsConfig) {
      if (!teamsMap.has(config.id)) {
        teamsMap.set(config.id, { id: config.id, slug: slugFromId(config.id), name: config.name, category: config.category });
      }
    }
    const teams = Array.from(teamsMap.values());

    const orchestratorJobs = activeTaskRuns.filter((task) => task.runtime === 'subagent' && task.owner_key === 'agent:main:main');
    const orchestrator: MissionControlBoardOrchestrator = {
      id: 'main',
      name: 'Charlie',
      role: 'PM / Orchestrator',
      state: orchestratorJobs.length > 0 ? 'running' : 'idle',
      summary:
        orchestratorJobs.length > 0
          ? `Coordinating ${orchestratorJobs.length} live specialist task${orchestratorJobs.length === 1 ? '' : 's'}`
          : 'No active delegated specialist work detected',
      activeDelegationCount: orchestratorJobs.length,
      waitingCount: flowRuns.filter((flow) => flow.status === 'running' && flow.blocked_summary).length,
      blockedCount: flowRuns.filter((flow) => flow.blocked_task_id || flow.blocked_summary).length,
      lastActiveAt: millisToIso(Math.max(...[0, ...orchestratorJobs.map((task) => task.last_event_at ?? task.started_at ?? task.created_at), sessionsByAgent.get('main')?.updatedAt ?? 0])),
      sessionKey: 'agent:main:main',
      source: 'openclaw-runtime',
      degraded: false,
    };

    const jobs = activeTaskRuns
      .filter((task) => task.runtime === 'subagent')
      .slice(0, ACTIVE_JOB_LIMIT)
      .map((task): MissionControlBoardJob => {
        const assignedAgentId = agentIdFromSessionKey(task.child_session_key);
        const recentFailure = failureTaskRuns.find((candidate) => candidate.source_id === task.source_id && candidate.status !== 'succeeded');
        return {
          id: task.task_id,
          sourceRunId: task.run_id,
          label: summarizeTask(task),
          detail: titleFromTaskText(task.task),
          ownerAgentId: agentIdFromSessionKey(task.owner_key),
          assignedAgentId,
          state: recentFailure ? 'failed' : 'running',
          status: task.status,
          createdAt: millisToIso(task.created_at) ?? new Date().toISOString(),
          startedAt: millisToIso(task.started_at),
          updatedAt: millisToIso(task.last_event_at ?? task.started_at ?? task.created_at) ?? new Date().toISOString(),
          endedAt: millisToIso(task.ended_at),
          progressSummary: task.progress_summary,
          blockedReason: null,
          source: 'openclaw-runtime',
        };
      });

    const handoffs = activeTaskRuns
      .filter((task) => task.runtime === 'subagent' && task.owner_key === 'agent:main:main')
      .slice(0, HANDOFF_LIMIT)
      .map((task): MissionControlBoardHandoff => ({
        id: task.task_id,
        fromAgentId: 'main',
        toAgentId: agentIdFromSessionKey(task.child_session_key) ?? 'unknown',
        jobId: task.task_id,
        label: summarizeTask(task),
        state: 'assigned',
        occurredAt: millisToIso(task.started_at ?? task.created_at) ?? new Date().toISOString(),
        source: 'openclaw-runtime',
      }));

    const blockers: MissionControlBoardBlocker[] = [
      ...flowRuns
        .filter((flow) => flow.blocked_task_id || flow.blocked_summary)
        .slice(0, BLOCKER_LIMIT)
        .map((flow) => ({
          id: flow.flow_id,
          scope: 'flow' as const,
          relatedId: flow.blocked_task_id ?? flow.flow_id,
          severity: 'warning' as const,
          title: flow.goal || 'Blocked flow',
          detail: flow.blocked_summary ?? 'Flow is blocked with no extra detail provided by OpenClaw.',
          occurredAt: millisToIso(flow.updated_at) ?? new Date().toISOString(),
          source: 'openclaw-runtime',
        })),
      ...failureTaskRuns.slice(0, BLOCKER_LIMIT).map((task) => ({
        id: task.task_id,
        scope: 'task' as const,
        relatedId: task.task_id,
        severity: task.status === 'timed_out' ? 'warning' as const : 'error' as const,
        title: summarizeTask(task),
        detail: task.error ?? task.terminal_summary ?? task.progress_summary ?? `Task ended with status ${task.status}.`,
        occurredAt: millisToIso(task.ended_at ?? task.last_event_at ?? task.created_at) ?? new Date().toISOString(),
        source: 'openclaw-runtime',
      })),
    ].slice(0, BLOCKER_LIMIT);

    const events = recentTaskRuns.map((task): MissionControlBoardEvent => {
      const assignedAgentId = agentIdFromSessionKey(task.child_session_key);
      const ownerAgentId = agentIdFromSessionKey(task.owner_key);
      const eventType =
        task.runtime === 'subagent'
          ? task.status === 'running'
            ? 'delegation.started'
            : task.status === 'succeeded'
              ? 'delegation.completed'
              : ['failed', 'timed_out', 'lost', 'cancelled'].includes(task.status)
                ? 'delegation.failed'
                : 'delegation.updated'
          : task.status === 'running'
            ? 'worker.active'
            : 'worker.updated';
      return {
        id: `${task.task_id}:${task.status}:${task.last_event_at ?? task.ended_at ?? task.created_at}`,
        type: eventType,
        severity: ['failed', 'lost'].includes(task.status)
          ? 'error'
          : task.status === 'timed_out'
            ? 'warning'
            : 'info',
        title: summarizeTask(task),
        detail: task.progress_summary ?? task.terminal_summary ?? titleFromTaskText(task.task),
        occurredAt: millisToIso(task.last_event_at ?? task.ended_at ?? task.started_at ?? task.created_at) ?? new Date().toISOString(),
        source: 'openclaw-runtime',
        agentId: assignedAgentId,
        ownerAgentId,
        jobId: task.runtime === 'subagent' ? task.task_id : null,
        payload: {
          taskId: task.task_id,
          runId: task.run_id,
          status: task.status,
          runtime: task.runtime,
          deliveryStatus: task.delivery_status,
        },
      };
    });

    const lastUpdatedAt = millisToIso(
      Math.max(
        0,
        ...taskRuns.map((task) => task.last_event_at ?? task.ended_at ?? task.started_at ?? task.created_at),
        ...flowRuns.map((flow) => flow.updated_at),
        ...Array.from(sessionsByAgent.values()).map((session) => session.updatedAt ?? 0),
      ),
    );

    const missingSources: string[] = [];
    if (!config) missingSources.push('openclaw.json');
    if (!fileExists(tasksDbPath)) missingSources.push('tasks/runs.sqlite');
    if (!fileExists(flowsDbPath)) missingSources.push('flows/registry.sqlite');

    return {
      generatedAt: new Date().toISOString(),
      runtime: {
        source: 'openclaw-runtime',
        status: missingSources.length ? 'degraded' : 'ok',
        degraded: missingSources.length > 0,
        unavailable: activeTaskRuns.length === 0 && events.length === 0,
        cursor: lastUpdatedAt,
        lastUpdatedAt,
        errorMessage: missingSources.length ? `Missing runtime sources: ${missingSources.join(', ')}` : null,
        sources: {
          configPath,
          tasksDbPath,
          flowsDbPath,
        },
      },
      summary: {
        activeAgents: agents.filter((agent) => ['running', 'idle'].includes(agent.state)).length,
        activeJobs: jobs.length,
        handoffs: handoffs.length,
        blockers: blockers.length,
        failures: failureTaskRuns.length,
        liveEvents: events.length,
      },
      teams,
      orchestrator,
      agents,
      jobs,
      handoffs,
      blockers,
      events,
    };
  }

  private loadSessionsByAgent(): Map<string, SessionIndexEntry> {
    const config = readJsonFile<OpenClawConfig>(path.join(OPENCLAW_STATE_DIR, 'openclaw.json'));
    const agents = config?.agents?.list ?? [{ id: 'main' }];
    const result = new Map<string, SessionIndexEntry>();

    for (const agent of agents) {
      const sessionsPath = path.join(OPENCLAW_STATE_DIR, 'agents', agent.id, 'sessions', 'sessions.json');
      const sessions = readJsonFile<Record<string, SessionIndexEntry>>(sessionsPath) ?? {};
      const recent = Object.values(sessions).sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))[0];
      if (recent) result.set(agent.id, recent);
    }

    return result;
  }

  private loadTaskRuns(filePath: string): TaskRunRow[] {
    if (!fileExists(filePath)) return [];
    const db = new Database(filePath, { readonly: true, fileMustExist: true });
    try {
      return db
        .prepare(`
          SELECT
            task_id, runtime, source_id, owner_key, child_session_key, parent_flow_id, run_id,
            label, task, status, delivery_status, notify_policy,
            created_at, started_at, ended_at, last_event_at, error, progress_summary, terminal_summary, terminal_outcome
          FROM task_runs
          ORDER BY COALESCE(last_event_at, ended_at, started_at, created_at) DESC
        `)
        .all() as TaskRunRow[];
    } finally {
      db.close();
    }
  }

  private loadFlowRuns(filePath: string): FlowRunRow[] {
    if (!fileExists(filePath)) return [];
    const db = new Database(filePath, { readonly: true, fileMustExist: true });
    try {
      return db
        .prepare(`
          SELECT flow_id, owner_key, status, goal, current_step, blocked_task_id, blocked_summary, created_at, updated_at, ended_at
          FROM flow_runs
          ORDER BY updated_at DESC
        `)
        .all() as FlowRunRow[];
    } finally {
      db.close();
    }
  }
}
