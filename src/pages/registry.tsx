import { useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useAgentsData, useBoardData, useEventsData, useFactoryFloorData, usePipelineData, useRoleCoverageData, useActivityData, useOverviewData, useSettingsData, useSourcesData, useTasksData, useTeamsConfigData, createTeam, deleteTeam, assignAgentToTeam, unassignAgent } from '../api';
import { pages } from '../data/navigation';
import type { EventItem, InspectorPayload, PreviewCard, SourceStatus, TeamConfigItem, TeamFactoryFloorItem, TeamPipelineStage, TeamRoleCoverage, TeamActivityPoint } from '../types';

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

function possessive(name: string) {
  return name.endsWith('s') ? `${name}'` : `${name}'s`;
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

const demoJobs: Array<{ agentIndex: number; label: string; detail: string; state: string }> = [
  { agentIndex: 0, label: 'Implement authentication service', detail: 'Building JWT-based auth flow for the gateway layer.', state: 'running' },
  { agentIndex: 1, label: 'Review database schema migration', detail: 'Reviewing proposed schema changes for user tables.', state: 'running' },
  { agentIndex: 3, label: 'Fix failing integration tests', detail: 'Investigating test failures in the CI pipeline.', state: 'blocked' },
  { agentIndex: 5, label: 'Security audit on API endpoints', detail: 'Completed OWASP top-10 review of public endpoints.', state: 'complete' },
];

function OverviewPage() {
  const { setHoverPreview, setInspector } = useShellContext();
  const board = useBoardData();
  const overview = useOverviewData();
  const tasks = useTasksData();
  const sources = useSourcesData();
  const [demoMode, setDemoMode] = useState(false);

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
      const realJob = board.data.jobs.find((item) => item.id === agent.activeJobId) ?? null;
      const demo = demoMode ? demoJobs.find((d) => d.agentIndex === index) : null;
      const job = realJob ?? (demo ? { id: `demo-${index}`, label: demo.label, detail: demo.detail, state: demo.state, status: demo.state, source: 'demo' } as any : null);
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
  }, [board.data, demoMode]);

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
      <section className="panel mission-board-panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="panel-label" style={{ marginBottom: 0 }}>{possessive(board.data.orchestrator.name)} orchestration board</div>
          <button
            className={`ghost-button${demoMode ? ' active' : ''}`}
            onClick={() => setDemoMode((d) => !d)}
            style={demoMode ? { background: 'rgba(82, 119, 255, 0.24)', borderColor: 'rgba(113, 136, 255, 0.3)', fontSize: '0.76rem', padding: '6px 10px' } : { fontSize: '0.76rem', padding: '6px 10px' }}
          >
            {demoMode ? 'Demo active' : 'Demo'}
          </button>
        </div>
        <div className="topbar-note mission-note-row" style={{ marginBottom: '12px' }}>
          <span className={`pill tone-pill tone-${missionStatus.tone}`}>{missionStatus.title}</span>
          <span className={`pill tone-pill tone-${sourceState.tone}`}>{sourceState.label}</span>
          <span className="pill accent">{overview.data.summary.activeTasks} active · {overview.data.summary.blockedTasks} blocked</span>
        </div>
        {board.loading ? (
          <DataState loading emptyMessage="" />
        ) : board.error ? (
          <DataState error={board.error} emptyMessage="" />
        ) : board.data.runtime.unavailable ? (
          <DataState emptyMessage="Runtime has no live operator state yet. Seed/demo fallback is intentionally disabled." />
        ) : (
          <div className="mission-board">
            <div className="mission-grid" aria-hidden="true"><span /></div>
            {orchestration.map((node) => {
              const hasJob = !!node.job;
              const flowClass = hasJob ? 'flow-active' : 'flow-idle';
              const isComplete = node.tone === 'complete';
              const isFailed = node.tone === 'failed';
              const direction = (isComplete || isFailed) ? 'inbound' : 'outbound';
              const speed = node.tone === 'running' ? '1.8s' : node.tone === 'blocked' ? '3.5s' : '2.4s';
              return (
                <button
                  key={node.agent.id}
                  className={`handoff-link tone-${node.tone} ${flowClass}`}
                  style={{ width: `${node.lineLength}px`, transform: `translateY(-50%) rotate(${node.lineAngle}rad)`, '--line-angle': `${node.lineAngle}rad`, '--flow-speed': speed } as React.CSSProperties}
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
                >
                  <span className="flow-trail" />
                  {hasJob && (
                    <>
                      <span className={`flow-particle ${direction} p1`} />
                      <span className={`flow-particle ${direction} p2`} />
                      <span className={`flow-particle ${direction} p3`} />
                    </>
                  )}
                  <span className="flow-tooltip">
                    <strong>{node.agent.name}</strong>
                    <span className="flow-tooltip-state">{node.job?.label ?? labelForStatus(node.agent.state)}</span>
                  </span>
                </button>
              );
            })}

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

      <section className={`panel hero-panel tone-${missionStatus.tone}`}>
        <div className="panel-label">Mission status</div>
        <h2>{missionStatus.title}</h2>
        <p>{missionStatus.body}</p>
        <div className="topbar-note mission-note-row">
          <span className="pill muted">{sourceState.detail}</span>
        </div>
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
  const { setHoverPreview, setInspector } = useShellContext();
  const { data, loading, error, refetch } = useFactoryFloorData();
  const [newName, setNewName] = useState('');
  const [newCategory, setNewCategory] = useState('general');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!newName.trim() || busy) return;
    setFormError(null);
    setBusy(true);
    try {
      await createTeam({ name: newName.trim(), category: newCategory });
      setNewName('');
      refetch();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to create department');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page-stack">
      <RouteHero title="Factory Floor" body="Department groupings with agent staffing and task counts." status={`${data.length} departments`} />

      <section className="panel">
        <div className="panel-label">Create new department</div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            type="text"
            value={newName}
            onChange={e => { setNewName(e.target.value); setFormError(null); }}
            placeholder="Department name"
            className="ghost-button"
            style={{ flex: '1 1 200px', minWidth: 0 }}
            onKeyDown={e => e.key === 'Enter' && handleCreate()}
          />
          <select value={newCategory} onChange={e => setNewCategory(e.target.value)} className="ghost-button">
            <option value="coordination">Coordination</option>
            <option value="infrastructure">Infrastructure</option>
            <option value="delivery">Delivery</option>
            <option value="quality">Quality</option>
            <option value="general">General</option>
          </select>
          <button className="ghost-button" onClick={handleCreate} disabled={busy || !newName.trim()}>Create</button>
        </div>
        {formError && <div className="empty-state error-state" style={{ marginTop: '10px' }}>{formError}</div>}
      </section>

      <section className="panel">
        <div className="panel-label">Department overview</div>
        {data.length ? (
          <div className="card-grid columns-2">
            {data.map((team: TeamFactoryFloorItem) => (
              <button
                key={team.id}
                className="info-card clickable"
                onMouseEnter={() => setHoverPreview({ eyebrow: team.category ?? 'department', title: team.name, detail: `${team.agentCount} agents · ${team.taskCount} tasks`, status: team.status })}
                onMouseLeave={() => setHoverPreview(null)}
                onClick={() =>
                  setInspectorFields(setInspector, {
                    kind: 'item',
                    title: team.name,
                    subtitle: team.category ?? 'Department',
                    summary: `${team.staffedCount} of ${team.agentCount} agents staffed, ${team.taskCount} active tasks.`,
                    fields: [
                      { label: 'Status', value: team.status },
                      { label: 'Agents', value: `${team.staffedCount} / ${team.agentCount}` },
                      { label: 'Tasks', value: `${team.taskCount}` },
                      { label: 'Blocked', value: `${team.blockedTaskCount}` },
                      { label: 'Avg utilization', value: `${team.avgUtilizationPct}%` },
                      { label: 'Last activity', value: fmtDate(team.lastActivityAt) },
                    ],
                  })
                }
              >
                <span className="eyebrow">{team.category ?? 'department'}</span>
                <strong>{team.name}</strong>
                <p>{team.staffedCount} / {team.agentCount} agents staffed · {team.taskCount} tasks</p>
                <span className={`pill ${team.status === 'active' ? 'accent' : 'muted'}`}>{team.status} · {team.avgUtilizationPct}% util</span>
              </button>
            ))}
          </div>
        ) : (
          <DataState loading={loading} error={error} emptyMessage="No departments configured." />
        )}
      </section>
    </div>
  );
}

function TeamsPipelinePage() {
  const { setHoverPreview, setInspector } = useShellContext();
  const { data, loading, error } = usePipelineData();

  return (
    <div className="page-stack">
      <RouteHero title="Pipeline" body="Task queue stages grouped by department." status={`${data.length} stage entries`} />
      <section className="panel">
        <div className="panel-label">Queue stages by department</div>
        <div className="timeline-list">
          {data.map((stage: TeamPipelineStage, index) => (
            <button
              key={`${stage.teamId}-${stage.queueStage}`}
              className="timeline-item clickable timeline-item-spread"
              onMouseEnter={() => setHoverPreview({ eyebrow: stage.teamName ?? stage.teamId, title: stage.queueStage, detail: `${stage.taskCount} tasks`, status: stage.urgentTaskCount ? `${stage.urgentTaskCount} urgent` : 'normal' })}
              onMouseLeave={() => setHoverPreview(null)}
              onClick={() =>
                setInspectorFields(setInspector, {
                  kind: 'item',
                  title: `${stage.teamName} · ${stage.queueStage}`,
                  subtitle: 'Pipeline stage',
                  summary: `${stage.taskCount} tasks in ${stage.queueStage} for ${stage.teamName}.`,
                  fields: [
                    { label: 'Tasks', value: `${stage.taskCount}` },
                    { label: 'Urgent', value: `${stage.urgentTaskCount}` },
                    { label: 'Blocked', value: `${stage.blockedTaskCount}` },
                    { label: 'Last updated', value: fmtDate(stage.lastUpdatedAt) },
                  ],
                })
              }
            >
              <span className="timeline-index">{index + 1}</span>
              <span>
                <strong>{stage.teamName} — {stage.queueStage}</strong>
                <span className="timeline-meta">{stage.taskCount} tasks · {fmtDate(stage.lastUpdatedAt)}</span>
              </span>
            </button>
          ))}
          {!data.length && <DataState loading={loading} error={error} emptyMessage="No pipeline stages with active work." />}
        </div>
      </section>
    </div>
  );
}

function TeamsRolesPage() {
  const { setHoverPreview, setInspector } = useShellContext();
  const { data, loading, error } = useRoleCoverageData();

  return (
    <div className="page-stack">
      <RouteHero title="Roles" body="Role staffing and utilization across departments." status={`${data.length} role entries`} />
      <section className="panel">
        <div className="panel-label">Role coverage by department</div>
        {data.length ? (
          <div className="card-grid columns-2">
            {data.map((entry: TeamRoleCoverage) => (
              <button
                key={`${entry.teamId}-${entry.role}`}
                className="info-card clickable"
                onMouseEnter={() => setHoverPreview({ eyebrow: entry.teamName ?? entry.teamId, title: entry.role, detail: `${entry.availableCount} / ${entry.staffedCount} available`, status: `${entry.avgUtilizationPct}% util` })}
                onMouseLeave={() => setHoverPreview(null)}
                onClick={() =>
                  setInspectorFields(setInspector, {
                    kind: 'item',
                    title: `${entry.role}`,
                    subtitle: entry.teamName ?? entry.teamId,
                    summary: `${entry.availableCount} of ${entry.staffedCount} agents available for ${entry.role} in ${entry.teamName}.`,
                    fields: [
                      { label: 'Staffed', value: `${entry.staffedCount}` },
                      { label: 'Available', value: `${entry.availableCount}` },
                      { label: 'Avg utilization', value: `${entry.avgUtilizationPct}%` },
                    ],
                  })
                }
              >
                <span className="eyebrow">{entry.teamName}</span>
                <strong>{entry.role}</strong>
                <p>{entry.availableCount} / {entry.staffedCount} available</p>
                <span className="pill muted">{entry.avgUtilizationPct}% util</span>
              </button>
            ))}
          </div>
        ) : (
          <DataState loading={loading} error={error} emptyMessage="No role coverage data." />
        )}
      </section>
    </div>
  );
}

function TeamsActivityPage() {
  const { setHoverPreview, setInspector } = useShellContext();
  const { data, loading, error } = useActivityData();

  return (
    <div className="page-stack">
      <RouteHero title="Activity" body="Event history grouped by department and date." status={`${data.length} activity entries`} />
      <section className="panel">
        <div className="panel-label">Department activity timeline</div>
        <div className="timeline-list">
          {data.map((entry: TeamActivityPoint, index) => (
            <button
              key={`${entry.teamId}-${entry.activityDate}`}
              className="timeline-item clickable timeline-item-spread"
              onMouseEnter={() => setHoverPreview({ eyebrow: entry.teamName ?? entry.teamId, title: entry.activityDate, detail: `${entry.eventCount} events · ${entry.incidentCount} incidents`, status: entry.incidentCount ? 'incidents' : 'normal' })}
              onMouseLeave={() => setHoverPreview(null)}
              onClick={() =>
                setInspectorFields(setInspector, {
                  kind: 'item',
                  title: `${entry.teamName} · ${entry.activityDate}`,
                  subtitle: 'Daily activity',
                  summary: `${entry.eventCount} events, ${entry.incidentCount} incidents on ${entry.activityDate}.`,
                  fields: [
                    { label: 'Events', value: `${entry.eventCount}` },
                    { label: 'Incidents', value: `${entry.incidentCount}` },
                    { label: 'Last event', value: fmtDate(entry.lastEventAt) },
                  ],
                })
              }
            >
              <span className="timeline-index">{index + 1}</span>
              <span>
                <strong>{entry.teamName} — {entry.activityDate}</strong>
                <span className="timeline-meta">{entry.eventCount} events · {entry.incidentCount} incidents · {fmtDate(entry.lastEventAt)}</span>
              </span>
            </button>
          ))}
          {!data.length && <DataState loading={loading} error={error} emptyMessage="No department activity recorded." />}
        </div>
      </section>
    </div>
  );
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

function TeamsManagePage() {
  const { setHoverPreview } = useShellContext();
  const teamsConfig = useTeamsConfigData();
  const board = useBoardData();
  const [busy, setBusy] = useState(false);

  const allAgents = board.data.agents;

  const reload = () => { teamsConfig.refetch(); };

  const handleDelete = async (teamId: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await deleteTeam(teamId);
      reload();
    } finally {
      setBusy(false);
    }
  };

  const handleAssign = async (agentId: string, teamId: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await assignAgentToTeam(agentId, teamId);
      reload();
    } finally {
      setBusy(false);
    }
  };

  const handleUnassign = async (agentId: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await unassignAgent(agentId);
      reload();
    } finally {
      setBusy(false);
    }
  };

  const handleReassign = async (agentId: string, newTeamId: string) => {
    if (busy) return;
    if (newTeamId === '') {
      await handleUnassign(agentId);
    } else {
      await handleAssign(agentId, newTeamId);
    }
  };

  // Build a lookup: agentId -> teamId for directly assigned agents
  const agentToTeam = new Map<string, string>();
  for (const team of teamsConfig.data) {
    for (const agentId of team.agents ?? []) {
      agentToTeam.set(agentId, team.id);
    }
  }

  const isPatternMatched = (agentId: string) =>
    teamsConfig.data.some((t: TeamConfigItem) => t.match && agentId.startsWith(t.match.replace('*', '')));

  const unassignedAgents = allAgents.filter(a => !agentToTeam.has(a.id) && !isPatternMatched(a.id));

  return (
    <div className="page-stack">
      <RouteHero title="Manage Departments" body="Assign agents to departments, delete departments. Create new departments from the Factory Floor view." status={`${teamsConfig.data.length} departments configured`} />

      {teamsConfig.data.map((team: TeamConfigItem) => {
        const teamAgents = allAgents.filter(a =>
          (team.agents ?? []).includes(a.id) ||
          (team.match && a.id.startsWith(team.match.replace('*', '')))
        );
        const matchedByPattern = team.match ? allAgents.filter(a => a.id.startsWith(team.match!.replace('*', ''))).map(a => a.id) : [];

        return (
          <section key={team.id} className="panel">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <div>
                <div className="panel-label">{team.category}</div>
                <h3 style={{ margin: 0 }}>{team.name}</h3>
                {team.match && <span className="pill muted" style={{ marginTop: '6px' }}>Pattern: {team.match}</span>}
              </div>
              <button className="ghost-button" onClick={() => handleDelete(team.id)} disabled={busy} style={{ color: '#ff7f90' }}>Delete</button>
            </div>

            <div className="card-grid columns-2">
              {teamAgents.map(agent => (
                <div key={agent.id} className="info-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div
                    onMouseEnter={() => setHoverPreview({ eyebrow: agent.role, title: agent.name, detail: agent.statusLabel, status: agent.state })}
                    onMouseLeave={() => setHoverPreview(null)}
                  >
                    <strong style={{ display: 'block' }}>{agent.name}</strong>
                    <span style={{ color: '#9cb0ea', fontSize: '0.9rem' }}>{agent.role}</span>
                    <span className={`state-chip tone-${toneForStatus(agent.state)}`} style={{ marginLeft: '8px' }}>{labelForStatus(agent.state)}</span>
                  </div>
                  {!matchedByPattern.includes(agent.id) && (
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                      <select
                        className="ghost-button"
                        value={team.id}
                        disabled={busy}
                        onChange={e => handleReassign(agent.id, e.target.value)}
                        style={{ fontSize: '0.82rem' }}
                      >
                        <option value="">Unassigned</option>
                        {teamsConfig.data.map((t: TeamConfigItem) => (
                          <option key={t.id} value={t.id}>{t.name}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  {matchedByPattern.includes(agent.id) && (
                    <span className="pill muted" style={{ fontSize: '0.78rem' }}>pattern-matched</span>
                  )}
                </div>
              ))}
              {!teamAgents.length && <div className="empty-state">No agents assigned to this department.</div>}
            </div>

            <div style={{ marginTop: '12px' }}>
              <div className="panel-label">Add agent to {team.name}</div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {allAgents
                  .filter(a => !(team.agents ?? []).includes(a.id) && !matchedByPattern.includes(a.id))
                  .map(agent => (
                    <button key={agent.id} className="ghost-button" onClick={() => handleAssign(agent.id, team.id)} disabled={busy} style={{ fontSize: '0.82rem' }}>
                      + {agent.name}
                    </button>
                  ))}
              </div>
            </div>
          </section>
        );
      })}

      {unassignedAgents.length > 0 && (
        <section className="panel">
          <div className="panel-label">Unassigned agents</div>
          <div className="card-grid columns-2">
            {unassignedAgents.map(agent => (
              <div
                key={agent.id}
                className="info-card"
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                onMouseEnter={() => setHoverPreview({ eyebrow: agent.role, title: agent.name, detail: 'Not assigned to any department', status: agent.state })}
                onMouseLeave={() => setHoverPreview(null)}
              >
                <div>
                  <strong style={{ display: 'block' }}>{agent.name}</strong>
                  <span style={{ color: '#9cb0ea', fontSize: '0.9rem' }}>{agent.role}</span>
                  <span className={`state-chip tone-${toneForStatus(agent.state)}`} style={{ marginLeft: '8px' }}>{labelForStatus(agent.state)}</span>
                </div>
                <select
                  className="ghost-button"
                  value=""
                  disabled={busy}
                  onChange={e => e.target.value && handleAssign(agent.id, e.target.value)}
                  style={{ fontSize: '0.82rem' }}
                >
                  <option value="">Assign to…</option>
                  {teamsConfig.data.map((t: TeamConfigItem) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </section>
      )}

      {teamsConfig.loading && <DataState loading emptyMessage="" />}
      {teamsConfig.error && <DataState error={teamsConfig.error} emptyMessage="" />}
    </div>
  );
}

const departmentTabs = [
  { key: 'factory-floor', label: 'Overview' },
  { key: 'pipeline', label: 'Pipeline' },
  { key: 'roles', label: 'Roles' },
  { key: 'activity', label: 'Activity' },
  { key: 'manage', label: 'Manage' },
] as const;

type DepartmentTab = (typeof departmentTabs)[number]['key'];

const departmentTabComponents: Record<DepartmentTab, React.FC> = {
  'factory-floor': TeamsFactoryFloorPage,
  'pipeline': TeamsPipelinePage,
  'roles': TeamsRolesPage,
  'activity': TeamsActivityPage,
  'manage': TeamsManagePage,
};

function DepartmentsPage() {
  const [activeTab, setActiveTab] = useState<DepartmentTab>('factory-floor');
  const ActiveComponent = departmentTabComponents[activeTab];

  return (
    <div className="page-stack">
      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '4px', alignItems: 'center' }}>
        {departmentTabs.map((tab) => (
          <button
            key={tab.key}
            className={`ghost-button${activeTab === tab.key ? ' active' : ''}`}
            onClick={() => setActiveTab(tab.key)}
            style={activeTab === tab.key ? { background: 'rgba(82, 119, 255, 0.24)', borderColor: 'rgba(113, 136, 255, 0.3)' } : undefined}
          >
            {tab.label}
          </button>
        ))}
        <span style={{ marginLeft: 'auto', fontSize: '0.76rem', color: '#8fa1d9' }}>
          Departments are a local grouping in Mission Control. No changes are made to OpenClaw.
        </span>
      </div>
      <ActiveComponent />
    </div>
  );
}

export const pageRegistry = [
  { path: 'overview', element: <OverviewPage /> },
  { path: 'agents', element: <AgentsPage /> },
  { path: 'tasks', element: <TasksPage /> },
  { path: 'events', element: <EventsPage /> },
  { path: 'settings', element: <SettingsPage /> },
  { path: 'teams/*', element: <DepartmentsPage /> },
];
