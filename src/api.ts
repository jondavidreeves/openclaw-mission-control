import { useEffect, useMemo, useState } from 'react';
import type {
  AgentListItem,
  ApiOverview,
  EventItem,
  MissionControlBoard,
  MissionControlBoardAgent,
  MissionControlBoardJob,
  SettingItem,
  SourceStatus,
  StreamEnvelope,
  TeamActivityPoint,
  TeamFactoryFloorItem,
  TeamPipelineStage,
  TeamRoleCoverage,
  TaskListItem,
} from './types';

async function ensureOk(response: Response) {
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed with ${response.status}`);
  }

  return response;
}

export async function fetchJson<T>(path: string): Promise<T> {
  const response = await ensureOk(await fetch(path, { headers: { Accept: 'application/json' } }));
  return response.json() as Promise<T>;
}

export function useApiData<T>(path: string, initialData: T) {
  const [data, setData] = useState<T>(initialData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    fetchJson<T>(path)
      .then((result) => {
        if (cancelled) return;
        setData(result);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [path]);

  return { data, loading, error, setData };
}

const emptyBoard: MissionControlBoard = {
  generatedAt: '',
  runtime: {
    source: 'openclaw-runtime',
    status: 'degraded',
    degraded: true,
    unavailable: true,
    cursor: null,
    lastUpdatedAt: null,
    errorMessage: null,
    sources: {},
  },
  summary: {
    activeAgents: 0,
    activeJobs: 0,
    handoffs: 0,
    blockers: 0,
    failures: 0,
    liveEvents: 0,
  },
  orchestrator: {
    id: 'main',
    name: 'Charlie',
    role: 'PM / Orchestrator',
    state: 'unavailable',
    summary: 'Runtime board unavailable.',
    activeDelegationCount: 0,
    waitingCount: 0,
    blockedCount: 0,
    lastActiveAt: null,
    sessionKey: 'agent:main:main',
    source: 'openclaw-runtime',
    degraded: true,
  },
  agents: [],
  jobs: [],
  handoffs: [],
  blockers: [],
  events: [],
};

function utilizationForAgent(agent: MissionControlBoardAgent) {
  switch (agent.state) {
    case 'running':
      return 100;
    case 'assigned':
    case 'blocked':
    case 'waiting':
      return 70;
    case 'idle':
      return 20;
    default:
      return 0;
  }
}

function mapBoardAgent(agent: MissionControlBoardAgent, jobs: MissionControlBoardJob[]): AgentListItem {
  const currentJob = agent.activeJobId ? jobs.find((job) => job.id === agent.activeJobId) : null;
  return {
    id: agent.id,
    slug: agent.id,
    name: agent.name,
    role: agent.role,
    status: agent.state,
    capacity: 1,
    utilizationPct: utilizationForAgent(agent),
    lastHeartbeatAt: agent.lastActiveAt,
    updatedAt: agent.lastActiveAt ?? new Date().toISOString(),
    truthStatus: agent.degraded ? 'degraded' : agent.state === 'unavailable' ? 'unavailable' : 'live',
    sourceKind: 'runtime-adapter',
    sourceLabel: agent.source,
    degradedReason: agent.degraded ? 'Runtime agent is unavailable or stale.' : null,
    team: null,
    currentTask: currentJob ? { id: currentJob.id, title: currentJob.label, status: currentJob.state } : null,
  };
}

function mapBoardJob(job: MissionControlBoardJob, agents: MissionControlBoardAgent[]): TaskListItem {
  const owner = job.assignedAgentId ? agents.find((agent) => agent.id === job.assignedAgentId) : null;
  return {
    id: job.id,
    title: job.label,
    status: job.status,
    priority: job.state === 'failed' || job.state === 'blocked' ? 'urgent' : 'normal',
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
    activeHandoffId: null,
    team: null,
    owner: owner ? { id: owner.id, slug: owner.id, name: owner.name } : null,
  };
}

function buildOverview(board: MissionControlBoard): ApiOverview {
  const truthStatus = board.runtime.unavailable ? 'unavailable' : board.runtime.degraded ? 'degraded' : 'live';
  const generatedAt = board.generatedAt || new Date().toISOString();
  return {
    generatedAt,
    metrics: [
      { key: 'agents_online', label: 'agents online', value: board.summary.activeAgents, unit: 'count', asOf: board.runtime.lastUpdatedAt ?? generatedAt, windowLabel: 'runtime-derived' },
      { key: 'tasks_active', label: 'tasks active', value: board.summary.activeJobs, unit: 'count', asOf: board.runtime.lastUpdatedAt ?? generatedAt, windowLabel: 'runtime-derived' },
      { key: 'tasks_blocked', label: 'tasks blocked', value: board.summary.blockers, unit: 'count', asOf: board.runtime.lastUpdatedAt ?? generatedAt, windowLabel: 'runtime-derived' },
      { key: 'handoffs_live', label: 'handoffs live', value: board.summary.handoffs, unit: 'count', asOf: board.runtime.lastUpdatedAt ?? generatedAt, windowLabel: 'runtime-derived' },
    ],
    summary: {
      teams: 0,
      agents: board.agents.length,
      onlineAgents: board.summary.activeAgents,
      activeTasks: board.summary.activeJobs,
      blockedTasks: board.summary.blockers,
      events24h: board.events.length,
    },
    board: {
      truthStatus,
      sourceMode: board.runtime.source,
      degradedSources: board.runtime.degraded ? 1 : 0,
      pendingHandoffs: board.summary.handoffs,
      seedTasks: 0,
      degradedTasks: board.summary.failures,
    },
    highlights: [
      board.orchestrator.summary,
      board.runtime.unavailable
        ? 'Runtime is reachable but no live operator state is currently available.'
        : board.runtime.degraded
          ? `Runtime degraded: ${board.runtime.errorMessage ?? 'one or more runtime sources are unavailable.'}`
          : `${board.summary.activeAgents} live agents visible from OpenClaw runtime`,
    ],
  };
}

export type StreamState = {
  connected: boolean;
  lastEvent: StreamEnvelope | null;
  heartbeatAt: string | null;
  snapshotOverview: ApiOverview | null;
};

const initialStreamState: StreamState = {
  connected: false,
  lastEvent: null,
  heartbeatAt: null,
  snapshotOverview: null,
};

export function useMissionStream(): StreamState {
  const [state, setState] = useState<StreamState>(initialStreamState);

  useEffect(() => {
    const source = new EventSource('/api/stream');

    source.onopen = () => {
      setState((current) => ({ ...current, connected: true }));
    };

    source.onerror = () => {
      setState((current) => ({ ...current, connected: false }));
    };

    const handleEnvelope = (event: MessageEvent<string>) => {
      try {
        const envelope = JSON.parse(event.data) as StreamEnvelope<{ overview?: ApiOverview; board?: MissionControlBoard }>;
        setState((current) => ({
          connected: true,
          lastEvent: envelope,
          heartbeatAt: envelope.type === 'heartbeat' ? envelope.ts : current.heartbeatAt,
          snapshotOverview:
            envelope.type === 'snapshot' && envelope.payload?.overview
              ? envelope.payload.overview
              : envelope.type === 'runtime.snapshot' && envelope.payload?.board
                ? buildOverview(envelope.payload.board)
                : current.snapshotOverview,
        }));
      } catch {
        // ignore malformed stream messages
      }
    };

    source.addEventListener('snapshot', handleEnvelope as EventListener);
    source.addEventListener('heartbeat', handleEnvelope as EventListener);
    source.addEventListener('runtime.snapshot', handleEnvelope as EventListener);

    return () => {
      source.close();
    };
  }, []);

  return state;
}

export function useBoardData() {
  return useApiData<MissionControlBoard>('/api/mission-control/board', emptyBoard);
}

export function useOverviewData() {
  const board = useBoardData();
  return {
    ...board,
    data: useMemo(() => buildOverview(board.data), [board.data]),
  };
}

export function useFactoryFloorData() {
  return useApiData<TeamFactoryFloorItem[]>('/api/teams/factory-floor', []);
}

export function usePipelineData() {
  return useApiData<TeamPipelineStage[]>('/api/teams/pipeline', []);
}

export function useRoleCoverageData() {
  return useApiData<TeamRoleCoverage[]>('/api/teams/roles', []);
}

export function useActivityData() {
  return useApiData<TeamActivityPoint[]>('/api/teams/activity', []);
}

export function useAgentsData() {
  const board = useBoardData();
  return {
    ...board,
    data: useMemo(() => board.data.agents.map((agent) => mapBoardAgent(agent, board.data.jobs)), [board.data]),
  };
}

export function useTasksData() {
  const board = useBoardData();
  return {
    ...board,
    data: useMemo(() => board.data.jobs.map((job) => mapBoardJob(job, board.data.agents)), [board.data]),
  };
}

export function useEventsData() {
  return useApiData<EventItem[]>('/api/events', []);
}

export function useSettingsData() {
  return useApiData<SettingItem[]>('/api/settings', []);
}

export function useSourcesData() {
  return useApiData<SourceStatus[]>('/api/sources', []);
}

export function useOverviewSummaryLabel(overview: ApiOverview | null) {
  return useMemo(() => {
    if (!overview) return 'Awaiting live summary';
    return `${overview.summary.activeTasks} active · ${overview.summary.blockedTasks} blocked · ${overview.summary.onlineAgents} online`;
  }, [overview]);
}
