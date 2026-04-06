import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useMemo, useState } from 'react';
import { useMissionStream, useOverviewSummaryLabel } from '../api';
import { pages, teamSubPages } from '../data/navigation';
import { hoverPreviewFallback, inspectorDefault } from '../data/mock';
import type { InspectorPayload, NavIconName, PreviewCard } from '../types';

function NavIcon({ name }: { name: NavIconName }) {
  const paths: Record<NavIconName, string[]> = {
    overview: ['M3 11.5L12 4l9 7.5', 'M5 10.5V20h14v-9.5'],
    teams: ['M4 7h7v5H4z', 'M13 7h7v5h-7z', 'M4 14h7v5H4z', 'M13 14h7v5h-7z'],
    agents: ['M12 12a3.25 3.25 0 100-6.5 3.25 3.25 0 000 6.5z', 'M5 19a7 7 0 0114 0'],
    tasks: ['M6 6h12', 'M6 12h12', 'M6 18h8', 'M4 6h.01', 'M4 12h.01', 'M4 18h.01'],
    events: ['M12 4v8l5 3', 'M12 21a9 9 0 100-18 9 9 0 000 18z'],
    settings: ['M12 9.25A2.75 2.75 0 1012 14.75 2.75 2.75 0 0012 9.25z', 'M19 12l2 1-2 1-.4 2.1-2.1.4-1 2-1-2-2.1-.4L11 14l-2-1 2-1 .4-2.1 2.1-.4 1-2 1 2 2.1.4z'],
    factory: ['M4 19V9l4 3V9l4 3V5l8 6v8z'],
    pipeline: ['M4 7h5v10H4z', 'M10 10h5v7h-5z', 'M16 13h4v4h-4z'],
    roles: ['M12 5l7 4v6l-7 4-7-4V9z', 'M12 5v14'],
    activity: ['M4 14h4l2-5 3 9 2-4h5'],
  };

  return (
    <span className="nav-icon" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        {paths[name].map((path, index) => (
          <path key={index} d={path} />
        ))}
      </svg>
    </span>
  );
}

export function AppShell() {
  const [navCollapsed, setNavCollapsed] = useState(false);
  const [hoverPreview, setHoverPreview] = useState<PreviewCard | null>(null);
  const [inspector, setInspector] = useState<InspectorPayload>(inspectorDefault);
  const location = useLocation();
  const navigate = useNavigate();
  const stream = useMissionStream();
  const streamSummary = useOverviewSummaryLabel(stream.snapshotOverview);

  const activePage = useMemo(
    () => [...pages, ...teamSubPages].find((item) => item.path === location.pathname),
    [location.pathname],
  );

  return (
    <div className="app-shell">
      <aside className={navCollapsed ? 'sidebar collapsed' : 'sidebar'}>
        <div className="sidebar-top">
          <div className="brand-row">
            <div className="brand-lockup">
              <div className="brand-badge">OC</div>
              {!navCollapsed && (
                <div>
                  <div className="eyebrow">OpenClaw</div>
                  <div className="brand-title">Mission Control</div>
                </div>
              )}
            </div>
            <button
              className="rail-toggle-icon"
              onClick={() => setNavCollapsed((current) => !current)}
              aria-label={navCollapsed ? 'Expand navigation rail' : 'Collapse navigation rail'}
              title={navCollapsed ? 'Expand navigation rail' : 'Collapse navigation rail'}
            >
              <span aria-hidden="true">{navCollapsed ? '›' : '‹'}</span>
            </button>
          </div>

          <nav className="nav-stack">
            {pages.map((item) => {
              const isTeams = item.id === 'teams';
              const isActive = isTeams ? location.pathname.startsWith('/teams') : location.pathname === item.path;
              return (
                <div key={item.id} className="nav-group">
                  <NavLink
                    to={item.path}
                    className={({ isActive: linkActive }) => `nav-item ${(linkActive || isActive) ? 'active' : ''}`}
                    onMouseEnter={() => setHoverPreview(item.preview)}
                    onMouseLeave={() => setHoverPreview(null)}
                    onClick={() => setInspector(item.inspector)}
                    title={navCollapsed ? item.label : undefined}
                  >
                    <NavIcon name={item.icon} />
                    {!navCollapsed && <span>{item.label}</span>}
                  </NavLink>

                  {isTeams && !navCollapsed && (
                    <div className="subnav">
                      {teamSubPages.map((subItem) => (
                        <button
                          key={subItem.id}
                          className={`subnav-item ${location.pathname === subItem.path ? 'active' : ''}`}
                          onMouseEnter={() => setHoverPreview(subItem.preview)}
                          onMouseLeave={() => setHoverPreview(null)}
                          onClick={() => {
                            navigate(subItem.path);
                            setInspector(subItem.inspector);
                          }}
                        >
                          <NavIcon name={subItem.icon} />
                          <span>{subItem.label}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>
        </div>

        <div className="sidebar-bottom" aria-hidden="true" />
      </aside>

      <main className="content-shell">
        <header className="topbar">
          <div>
            <div className="eyebrow">Live mission-control surface</div>
            <h1>{activePage?.label ?? 'Mission Control'}</h1>
          </div>
          <div className="topbar-note">
            <span className={`pill ${stream.connected ? 'accent' : ''}`}>{stream.connected ? 'SSE connected' : 'SSE reconnecting'}</span>
            <span className="pill">{streamSummary}</span>
            <span className="pill muted">Heartbeat {stream.heartbeatAt ? new Date(stream.heartbeatAt).toLocaleTimeString() : 'pending'}</span>
          </div>
        </header>

        <div className="workspace-grid">
          <section className="main-panel">
            <Outlet context={{ setHoverPreview, setInspector }} />
          </section>

          <aside className="right-rail">
            <section className="panel preview-panel">
              <div className="panel-label">Hover preview</div>
              <h3>{(hoverPreview ?? activePage?.preview ?? hoverPreviewFallback).title}</h3>
              <div className="eyebrow">{(hoverPreview ?? activePage?.preview ?? hoverPreviewFallback).eyebrow}</div>
              <p>{(hoverPreview ?? activePage?.preview ?? hoverPreviewFallback).detail}</p>
              <span className="pill muted">{(hoverPreview ?? activePage?.preview ?? hoverPreviewFallback).status ?? 'Ready'}</span>
            </section>

            <section className="panel inspector-panel">
              <div className="panel-label">Inspector</div>
              <h3>{inspector.title}</h3>
              <div className="inspector-subtitle">{inspector.subtitle}</div>
              <p>{inspector.summary}</p>
              <div className="field-list">
                {inspector.fields.map((field) => (
                  <div className="field-row" key={field.label}>
                    <span>{field.label}</span>
                    <strong>{field.value}</strong>
                  </div>
                ))}
              </div>
            </section>

            <section className="panel">
              <div className="panel-label">Live stream</div>
              <h3>{stream.lastEvent?.type ?? 'Waiting for stream event'}</h3>
              <p>{stream.lastEvent ? `Last stream message at ${new Date(stream.lastEvent.ts).toLocaleString()}` : 'Connected backend snapshot and heartbeat messages will appear here.'}</p>
              <div className="field-list compact-fields">
                <div className="field-row"><span>Status</span><strong>{stream.connected ? 'connected' : 'reconnecting'}</strong></div>
                <div className="field-row"><span>Heartbeat</span><strong>{stream.heartbeatAt ? new Date(stream.heartbeatAt).toLocaleTimeString() : 'pending'}</strong></div>
                <div className="field-row"><span>Event id</span><strong>{stream.lastEvent?.id ?? '—'}</strong></div>
              </div>
            </section>
          </aside>
        </div>
      </main>
    </div>
  );
}
