import { useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useAgentsData, useBoardData, useEventsData, useOverviewData, useSettingsData, useSourcesData, useTasksData } from '../api';
import { pages, teamSubPages } from '../data/navigation';
import type { EventItem, InspectorPayload, PreviewCard, SourceStatus } from '../types';

type ShellContext = {
  setHoverPreview: (preview: PreviewCard | null) => void;
  setInspector: (payload: InspectorPayload) => void;
};

function useShellContext() {
  return useOutletContext<ShellContext>();
}

function RouteHero({ title, body, status }: { title: string; body: string; status?: string }) {
  return (
    <section className="panel hero-panel">
      <div className="panel-label">Live route</div>
      <h2>{title}</h2>
      <p>{body}</p>
      {status ? <span className="pill muted">{status}</span> : null}
    </section>
  );
}

function DataState({ loading, error, emptyMessage }: { loading?: boolean; error?: string | null; emptyMessage: string }) {
  if (loading) return <div className="empty-state">Loading live backend data…</div>;
  if (error) return <div className="empty-state error-state">{error}</div>;
  return <div className="empty-state">{emptyMessage}</div>;
}

function UnavailableRoute({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="page-stack">
      <RouteHero title={title} body={detail} status="Unavailable until truthful runtime grouping exists" />
      <section className="panel unavailable-panel">
        <div className="panel-label">Why this route is blocked</div>
        <h3>No truthful team grouping is available</h3>
        <p>
          Mission Control now blocks team views when the backend cannot derive real pods, role lanes, or team activity from runtime state.
          This avoids showing seeded, demo, or fabricated operator structure.
        </p>
        <div className="field-list compact-fields">
          <div className="field-row"><span>Allowed fallback</span><strong>Explicit unavailable</strong></div>
          <div className="field-row"><span>Blocked fallback</span><strong>Seed/demo teams</strong></div>
          <div className="field-row"><span>Required backend gap</span><strong>Runtime-backed team topology</strong></div>
        </div>
      </section>
    </div>
  );
}

function fmtDate(value: string | null | undefined) {
  if (!value) return '—';
  return new Date(value).toLocaleString();
}

function setInspectorFields(setInspector: (payload: InspectorPayload) => void, payload: InspectorPayload) {
  setInspector(payload);
}

const orbitPositions = [
  { x: 50, y: 14 },
  { x: 75, y: 24 },
  { x: 84, y: 50 },
  { x: 75, y: 76 },
  { x: 50, y: 86 },
  { x: 25, y: 76 },
  { x: 16, y: 50 },
  { x: 25, y: 24 },
] as const;

const stateTone: Record<string, string> = {
  idle: 'idle',
  online: 'idle',
  assigned: 'assigned',
  queued: 'assigned',
  ready: 'assigned',
  busy: 'running',
  running: 'running',
  in_progress: 'running',
  blocked: 'blocked',
  waiting: 'waiting',
  review: 'waiting',
  complete: 'complete',
  completed: 'complete',
  done: 'complete',
  failed: 'failed',
  error: 'failed',
  offline: 'failed',
  unavailable: 'failed',
};

function toneForStatus(status: string | null | undefined) {
  return stateTone[(status ?? '').toLowerCase()] ?? 'idle';
}

function labelForStatus(status: string | null | undefined) {
  return (status ?? 'unknown').replace(/_/g, ' ');
}

function OverviewPage() {
  const { setHoverPreview, setInspector } = useShellContext();
  const board = useBoardData();
  const overview = useOverviewData();
  const tasks = useTasksData();
  const sources = useSourcesData();

  const orchestration = useMemo(() => {
    const orchestratorId = (board.data.orchestrator.id ?? '').trim().toLowerCase();
    const orchestratorName = (board.data.orchestrator.name ?? '').trim().toLowerCase();
    const agentRows = board.data.agents
      .filter((agent) => {
        const agentId = (agent.id ?? '').trim().toLowerCase();
        const agentName = (agent.name ?? '').trim().toLowerCase();
        const agentRole = (agent.role ?? '').trim().toLowerCase();
        return agentId !== orchestratorId && agentName !== orchestratorName && !agentRole.includes('orchestrator');
      })
      .slice(0, orbitPositions.length);

    return agentRows.map((agent, index) => {
      const job = board.data.jobs.find((item) => item.id === agent.activeJobId) ?? null;
      const position = orbitPositions[index % orbitPositions.length];
      const dx = position.x - 50;
      const dy = position.y - 50;
      return {
        agent,
        job,
        position,
        tone: toneForStatus(job?.state ?? agent.state),
        lineLength: Math.sqrt(dx * dx + dy * dy) * 7,
        lineAngle: Math.atan2(dy, dx),
      };
    });
  }, [board.data]);

  const sourceState = useMemo(() => {
    if (sources.loading) return { label: 'Loading source status', tone: 'waiting', detail: 'Source adapters have not reported yet.' };
    if (sources.error) return { label: 'Source telemetry unavailable', tone: 'failed', detail: sources.error };
    if (!sources.data.length) return { label: 'No sources configured', tone: 'blocked', detail: 'Backend returned no source state.' };
    const failing = sources.data.filter((item) => item.status !== 'ok' && item.status !== 'healthy');
    if (failing.length) {
      return {
        label: `${failing.length} degraded source${failing.length === 1 ? '' : 's'}`,
        tone: 'blocked',
        detail: failing.map((item) => `${item.source}: ${item.status}`).join(' · '),
      };
    }
    return { label: 'Sources healthy', tone: 'complete', detail: `${sources.data.length} source feeds reporting normally.` };
  }, [sources.data, sources.error, sources.loading]);

  const missionStatus = useMemo(() => {
    if (board.loading) {
      return {
        title: 'Loading live mission picture',
        body: 'Waiting for runtime board telemetry before drawing the command surface.',
        tone: 'waiting',
      };
    }
    if (board.error) {
      return {
        title: 'Mission picture unavailable',
        body: board.error,
        tone: 'failed',
      };
    }
    if (board.data.runtime.unavailable) {
      return {
        title: 'Runtime currently unavailable',
        body: board.data.runtime.errorMessage ?? 'No live operator state is available from the runtime adapter yet.',
        tone: 'blocked',
      };
    }
    if (board.data.runtime.degraded) {
      return {
        title: 'Mission picture degraded',
        body: board.data.runtime.errorMessage ?? 'Some runtime sources are degraded, but live state is still partially available.',
        tone: 'blocked',
      };
    }
    return {
      title: board.data.summary.blockers ? 'Intervention required on the board' : 'Mission board live',
      body: board.data.summary.blockers
        ? `${board.data.summary.blockers} blocker${board.data.summary.blockers === 1 ? '' : 's'} visible across live flows and delegations.`
        : board.data.orchestrator.summary,
      tone: board.data.summary.blockers ? 'blocked' : 'running',
    };
  }, [board.data, board.error, board.loading]);

  const queueByStage = tasks.data.reduce<Record<string, number>>((acc, task) => {
    acc[task.queueStage] = (acc[task.queueStage] ?? 0) + 1;
    return acc;
  }, {});

  const stateLegend = [
    ['idle', 'Idle / online, no live task'],
    ['assigned', 'Assigned / queued / ready for execution'],
    ['running', 'Running / busy / in progress'],
    ['blocked', 'Blocked / intervention needed'],
    ['waiting', 'Waiting / review / external dependency'],
    ['complete', 'Complete / healthy route'],
    ['failed', 'Failed / disconnected / unavailable'],
  ] as const;

  return (
    <div className="page-stack">
      <section className={`panel hero-panel tone-${missionStatus.tone}`}>
        <div className="panel-label">Primary command board</div>
        <h2>{missionStatus.title}</h2>
        <p>{missionStatus.body}</p>
        <div className="topbar-note mission-note-row">
          <span className={`pill tone-pill tone-${missionStatus.tone}`}>{sourceState.label}</span>
          <span className="pill muted">{sourceState.detail}</span>
          <span className="pill accent">{overview.data.summary.activeTasks} active · {overview.data.summary.blockedTasks} blocked</span>
        </div>
      </section>

      <section className="panel mission-board-panel">
        <div className="panel-label">Charlie orchestration board</div>
        {board.loading ? (
          <DataState loading emptyMessage="" />
        ) : board.error ? (
          <DataState error={board.error} emptyMessage="" />
        ) : board.data.runtime.unavailable ? (
          <DataState emptyMessage="Runtime has no live operator state yet. Seed/demo fallback is intentionally disabled." />
        ) : (
          <div className="mission-board">
            <div className="mission-grid" aria-hidden="true"><span /></div>
            {orchestration.map((node) => (
              <button
                key={node.agent.id}
                className={`handoff-link tone-${node.tone}`}
                style={{ width: `${node.lineLength}px`, transform: `translateY(-50%) rotate(${node.lineAngle}rad)` }}
                onMouseEnter={() => setHoverPreview({ eyebrow: node.agent.role, title: node.agent.name, detail: node.job?.label ?? node.agent.statusLabel, status: labelForStatus(node.job?.state ?? node.agent.state) })}
                onMouseLeave={() => setHoverPreview(null)}
                onClick={() =>
                  setInspectorFields(setInspector, {
                    kind: 'item',
                    title: node.agent.name,
                    subtitle: node.agent.role,
                    summary: node.job?.detail ?? node.agent.statusLabel,
                    fields: [
                      { label: 'State', value: labelForStatus(node.job?.state ?? node.agent.state) },
                      { label: 'Heartbeat', value: fmtDate(node.agent.lastActiveAt) },
                      { label: 'Active job', value: node.job?.label ?? 'None' },
                      { label: 'Source', value: node.agent.source },
                    ],
                  })
                }
                aria-label={`Handoff path to ${node.agent.name}`}
              />
            ))}

            <button
              className="charlie-core clickable"
              onMouseEnter={() => setHoverPreview({ eyebrow: 'Orchestrator', title: 'Charlie', detail: board.data.orchestrator.summary, status: labelForStatus(board.data.orchestrator.state) })}
              onMouseLeave={() => setHoverPreview(null)}
              onClick={() =>
                setInspectorFields(setInspector, {
                  kind: 'item',
                  title: 'Charlie',
                  subtitle: 'Central orchestrator',
                  summary: 'Mission Control is centered on live OpenClaw runtime orchestration.',
                  fields: [
                    { label: 'Delegations', value: `${board.data.orchestrator.activeDelegationCount}` },
                    { label: 'Waiting flows', value: `${board.data.orchestrator.waitingCount}` },
                    { label: 'Blocked flows', value: `${board.data.orchestrator.blockedCount}` },
                    { label: 'Last active', value: fmtDate(board.data.orchestrator.lastActiveAt) },
                  ],
                })
              }
            >
              <span className="charlie-ring" />
              <span className="eyebrow">Central orchestrator</span>
              <strong>Charlie</strong>
              <span>{orchestration.length} specialists visible</span>
            </button>

            {orchestration.map((node) => (
              <button
                key={`${node.agent.id}-node`}
                className={`agent-station clickable tone-${node.tone}`}
                style={{ left: `${node.position.x}%`, top: `${node.position.y}%` }}
                onMouseEnter={() => setHoverPreview({ eyebrow: node.agent.role, title: node.agent.name, detail: node.job?.label ?? node.agent.statusLabel, status: `${labelForStatus(node.job?.state ?? node.agent.state)} · ${fmtDate(node.agent.lastActiveAt)}` })}
                onMouseLeave={() => setHoverPreview(null)}
                onClick={() =>
                  setInspectorFields(setInspector, {
                    kind: 'item',
                    title: node.agent.name,
                    subtitle: node.agent.role,
                    summary: node.job?.detail ?? node.agent.statusLabel,
                    fields: [
                      { label: 'State', value: labelForStatus(node.job?.state ?? node.agent.state) },
                      { label: 'Current task', value: node.job?.label ?? 'Unassigned' },
                      { label: 'Bootstrap pending', value: node.agent.bootstrapPending ? 'yes' : 'no' },
                      { label: 'Heartbeat cadence', value: node.agent.heartbeatEvery ?? 'Not reported' },
                    ],
                  })
                }
              >
                <span className="station-role">{node.agent.role}</span>
                <strong>{node.agent.name}</strong>
                <span className="station-task">{node.job?.label ?? node.agent.statusLabel}</span>
                <span className={`state-chip tone-${node.tone}`}>{labelForStatus(node.job?.state ?? node.agent.state)}</span>
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="panel">
        <div className="panel-label">Handoff lanes and queue pressure</div>
        <div className="card-grid columns-3">
          {Object.entries(queueByStage).map(([stage, count]) => (
            <button
              key={stage}
              className="info-card clickable"
              onMouseEnter={() => setHoverPreview({ eyebrow: 'Queue stage', title: stage, detail: `${count} live task${count === 1 ? '' : 's'} currently in ${stage}.`, status: 'Live runtime' })}
              onMouseLeave={() => setHoverPreview(null)}
              onClick={() =>
                setInspectorFields(setInspector, {
                  kind: 'item',
                  title: stage,
                  subtitle: 'Queue pressure',
                  summary: `Visible delegated work currently staged in ${stage}.`,
                  fields: [
                    { label: 'Tasks', value: `${count}` },
                    { label: 'Board source', value: '/api/mission-control/board' },
                  ],
                })
              }
            >
              <span className="eyebrow">Mission pipeline</span>
              <strong>{stage}</strong>
              <p>{count} tasks visible on this lane</p>
            </button>
          ))}
          {!Object.keys(queueByStage).length && <DataState loading={tasks.loading} error={tasks.error} emptyMessage="No live delegated jobs returned." />}
        </div>
      </section>

      <section className="panel mission-lower-grid">
        <div>
          <div className="panel-label">State legend</div>
          <div className="legend-grid">
            {stateLegend.map(([tone, detail]) => (
              <div key={tone} className="legend-item">
                <span className={`state-chip tone-${tone}`}>{tone}</span>
                <span>{detail}</span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <div className="panel-label">Truthful source health</div>
          <div className="timeline-list">
            {sources.data.map((source: SourceStatus, index) => (
              <button
                key={source.source}
                className="timeline-item clickable timeline-item-spread"
                onMouseEnter={() => setHoverPreview({ eyebrow: source.kind, title: source.source, detail: source.errorMessage ?? JSON.stringify(source.metadata), status: source.status })}
                onMouseLeave={() => setHoverPreview(null)}
                onClick={() =>
                  setInspectorFields(setInspector, {
                    kind: 'item',
                    title: source.source,
                    subtitle: source.kind,
                    summary: source.errorMessage ?? 'Current backend source/adapter status.',
                    fields: [
                      { label: 'Status', value: source.status },
                      { label: 'Last sync', value: fmtDate(source.lastSyncedAt) },
                      { label: 'Cursor', value: source.cursor ?? '—' },
                    ],
                  })
                }
              >
                <span className="timeline-index">{index + 1}</span>
                <span>
                  <strong>{source.source}</strong>
                  <span className="timeline-meta">{source.kind} · {source.status} · {fmtDate(source.lastSyncedAt)}</span>
                </span>
              </button>
            ))}
            {!sources.data.length && <DataState loading={sources.loading} error={sources.error} emptyMessage="No source telemetry returned." />}
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-label">Recent mission signals</div>
        <div className="timeline-list">
          {board.data.events.slice(0, 6).map((event, index) => (
            <button
              key={event.id}
              className="timeline-item clickable timeline-item-spread"
              onMouseEnter={() => setHoverPreview({ eyebrow: event.type, title: event.title, detail: event.detail, status: event.severity })}
              onMouseLeave={() => setHoverPreview(null)}
              onClick={() =>
                setInspectorFields(setInspector, {
                  kind: 'item',
                  title: event.title,
                  subtitle: event.type,
                  summary: event.detail,
                  fields: [
                    { label: 'Severity', value: event.severity },
                    { label: 'Source', value: event.source },
                    { label: 'Occurred', value: fmtDate(event.occurredAt) },
                    { label: 'Entity', value: `${event.jobId ?? event.agentId ?? 'runtime'}` },
                  ],
                })
              }
            >
              <span className="timeline-index">{index + 1}</span>
              <span>
                <strong>{event.title}</strong>
                <span className="timeline-meta">{event.source} · {event.severity} · {fmtDate(event.occurredAt)}</span>
              </span>
            </button>
          ))}
          {!board.data.events.length && <DataState loading={board.loading} error={board.error} emptyMessage="No runtime events returned." />}
        </div>
      </section>
    </div>
  );
}

function TeamsFactoryFloorPage() {
  const page = teamSubPages.find((item) => item.id === 'teams-factory-floor')!;
  return <UnavailableRoute title="Factory floor unavailable" detail={page.inspector.summary} />;
}

function TeamsPipelinePage() {
  const page = teamSubPages.find((item) => item.id === 'teams-pipeline')!;
  return <UnavailableRoute title="Team pipeline unavailable" detail={page.inspector.summary} />;
}

function TeamsRolesPage() {
  const page = teamSubPages.find((item) => item.id === 'teams-roles')!;
  return <UnavailableRoute title="Role coverage unavailable" detail={page.inspector.summary} />;
}

function TeamsActivityPage() {
  const page = teamSubPages.find((item) => item.id === 'teams-activity')!;
  return <UnavailableRoute title="Team activity unavailable" detail={page.inspector.summary} />;
}

function AgentsPage() {
  const { setHoverPreview, setInspector } = useShellContext();
  const page = pages.find((item) => item.id === 'agents')!;
  const { data, loading, error } = useAgentsData();

  return (
    <div className="page-stack">
      <RouteHero title={page.preview.title} body={page.inspector.summary} status={`${data.length} runtime agents`} />
      <section className="panel">
        <div className="panel-label">Runtime roster</div>
        {data.length ? (
          <div className="card-grid columns-2">
            {data.map((agent) => (
              <button
                key={agent.id}
                className="info-card clickable"
                onMouseEnter={() => setHoverPreview({ eyebrow: agent.role, title: agent.name, detail: agent.currentTask?.title ?? 'No active task', status: agent.status })}
                onMouseLeave={() => setHoverPreview(null)}
                onClick={() =>
                  setInspectorFields(setInspector, {
                    kind: 'item',
                    title: agent.name,
                    subtitle: agent.role,
                    summary: agent.currentTask?.title ?? 'No current task assigned.',
                    fields: [
                      { label: 'Status', value: agent.status },
                      { label: 'Truth', value: agent.truthStatus },
                      { label: 'Utilization', value: `${agent.utilizationPct}%` },
                      { label: 'Heartbeat', value: fmtDate(agent.lastHeartbeatAt) },
                    ],
                  })
                }
              >
                <span className="eyebrow">{agent.sourceLabel}</span>
                <strong>{agent.name}</strong>
                <p>{agent.role}</p>
                <span className="pill muted">{agent.status} · {agent.utilizationPct}% util</span>
              </button>
            ))}
          </div>
        ) : (
          <DataState loading={loading} error={error} emptyMessage="No live agents returned." />
        )}
      </section>
    </div>
  );
}

function TasksPage() {
  const { setHoverPreview, setInspector } = useShellContext();
  const page = pages.find((item) => item.id === 'tasks')!;
  const { data, loading, error } = useTasksData();

  return (
    <div className="page-stack">
      <RouteHero title={page.preview.title} body={page.inspector.summary} status={`${data.length} live jobs`} />
      <section className="panel">
        <div className="panel-label">Delegated work</div>
        <div className="timeline-list">
          {data.map((task, index) => (
            <button
              key={task.id}
              className="timeline-item clickable timeline-item-spread"
              onMouseEnter={() => setHoverPreview({ eyebrow: task.queueStage, title: task.title, detail: task.owner?.name ?? 'Unassigned owner', status: `${task.status} · ${task.priority}` })}
              onMouseLeave={() => setHoverPreview(null)}
              onClick={() =>
                setInspectorFields(setInspector, {
                  kind: 'item',
                  title: task.title,
                  subtitle: task.sourceRef ?? task.id,
                  summary: task.blockedReason ?? `Task currently ${task.status}.`,
                  fields: [
                    { label: 'Stage', value: task.queueStage },
                    { label: 'Status', value: task.status },
                    { label: 'Priority', value: task.priority },
                    { label: 'Owner', value: task.owner?.name ?? 'Unassigned' },
                  ],
                })
              }
            >
              <span className="timeline-index">{index + 1}</span>
              <span>
                <strong>{task.title}</strong>
                <span className="timeline-meta">{task.status} · {task.priority} · {fmtDate(task.updatedAt)}</span>
              </span>
            </button>
          ))}
          {!data.length && <DataState loading={loading} error={error} emptyMessage="No live delegated work returned." />}
        </div>
      </section>
    </div>
  );
}

function EventsPage() {
  const { setHoverPreview, setInspector } = useShellContext();
  const page = pages.find((item) => item.id === 'events')!;
  const { data, loading, error } = useEventsData();

  return (
    <div className="page-stack">
      <RouteHero title={page.preview.title} body={page.inspector.summary} status={`${data.length} runtime events`} />
      <section className="panel">
        <div className="panel-label">Operational timeline</div>
        <div className="timeline-list">
          {data.map((event: EventItem, index) => (
            <button
              key={event.id}
              className="timeline-item clickable timeline-item-spread"
              onMouseEnter={() => setHoverPreview({ eyebrow: event.eventType, title: event.title, detail: event.detail ?? 'No detail', status: event.severity })}
              onMouseLeave={() => setHoverPreview(null)}
              onClick={() =>
                setInspectorFields(setInspector, {
                  kind: 'item',
                  title: event.title,
                  subtitle: event.eventType,
                  summary: event.detail ?? 'No additional detail.',
                  fields: [
                    { label: 'Severity', value: event.severity },
                    { label: 'Source', value: event.source },
                    { label: 'Occurred', value: fmtDate(event.occurredAt) },
                    { label: 'Entity', value: `${event.entityType}:${event.entityId}` },
                  ],
                })
              }
            >
              <span className="timeline-index">{index + 1}</span>
              <span>
                <strong>{event.title}</strong>
                <span className="timeline-meta">{event.source} · {event.severity} · {fmtDate(event.occurredAt)}</span>
              </span>
            </button>
          ))}
          {!data.length && <DataState loading={loading} error={error} emptyMessage="No runtime events returned." />}
        </div>
      </section>
    </div>
  );
}

function SettingsPage() {
  const { setHoverPreview, setInspector } = useShellContext();
  const page = pages.find((item) => item.id === 'settings')!;
  const { data, loading, error } = useSettingsData();

  return (
    <div className="page-stack">
      <RouteHero title={page.preview.title} body={page.inspector.summary} status={`${data.length} settings`} />
      <section className="panel">
        <div className="panel-label">Current configuration snapshot</div>
        <div className="timeline-list">
          {data.map((item, index) => (
            <button
              key={item.key}
              className="timeline-item clickable timeline-item-spread"
              onMouseEnter={() => setHoverPreview({ eyebrow: item.category, title: item.key, detail: JSON.stringify(item.value), status: item.source })}
              onMouseLeave={() => setHoverPreview(null)}
              onClick={() =>
                setInspectorFields(setInspector, {
                  kind: 'item',
                  title: item.key,
                  subtitle: item.category,
                  summary: 'Current backend-provided configuration value.',
                  fields: [
                    { label: 'Value', value: JSON.stringify(item.value) },
                    { label: 'Category', value: item.category },
                    { label: 'Source', value: item.source },
                  ],
                })
              }
            >
              <span className="timeline-index">{index + 1}</span>
              <span>
                <strong>{item.key}</strong>
                <span className="timeline-meta">{JSON.stringify(item.value)}</span>
              </span>
            </button>
          ))}
          {!data.length && <DataState loading={loading} error={error} emptyMessage="No settings returned." />}
        </div>
      </section>
    </div>
  );
}

export const pageRegistry = [
  { path: 'overview', element: <OverviewPage /> },
  { path: 'agents', element: <AgentsPage /> },
  { path: 'tasks', element: <TasksPage /> },
  { path: 'events', element: <EventsPage /> },
  { path: 'settings', element: <SettingsPage /> },
  { path: 'teams/factory-floor', element: <TeamsFactoryFloorPage /> },
  { path: 'teams/pipeline', element: <TeamsPipelinePage /> },
  { path: 'teams/roles', element: <TeamsRolesPage /> },
  { path: 'teams/activity', element: <TeamsActivityPage /> },
];
