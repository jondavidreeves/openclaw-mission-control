import type { PageDescriptor } from '../types';

export const pages: PageDescriptor[] = [
  {
    id: 'overview',
    label: 'Overview',
    path: '/overview',
    icon: 'overview',
    preview: { eyebrow: 'Operator board', title: 'Live mission overview', detail: 'Runtime-derived command picture for Charlie, specialists, handoffs, and blockers.', status: 'Live runtime' },
    inspector: {
      kind: 'route',
      title: 'Overview',
      subtitle: 'Live operator board',
      summary: 'Primary operator surface driven by runtime truth from Mission Control board state.',
      fields: [
        { label: 'Primary source', value: '/api/mission-control/board' },
        { label: 'Fallback rule', value: 'Explicit degraded/unavailable only' },
      ],
    },
  },
  {
    id: 'agents',
    label: 'Agents',
    path: '/agents',
    icon: 'agents',
    preview: { eyebrow: 'Runtime roster', title: 'Agents', detail: 'Live specialists visible from the runtime adapter, with no seeded roster fallback.', status: 'Runtime-derived' },
    inspector: {
      kind: 'route',
      title: 'Agents',
      subtitle: 'Runtime roster',
      summary: 'Operator-safe roster of live or degraded agents returned by runtime-backed Mission Control APIs.',
      fields: [
        { label: 'Entity focus', value: 'Specialists and current delegated work' },
        { label: 'Data policy', value: 'Live, degraded, or unavailable only' },
      ],
    },
  },
  {
    id: 'teams',
    label: 'Departments',
    path: '/teams',
    icon: 'teams',
    preview: { eyebrow: 'Department grouping', title: 'Departments', detail: 'Agents organised into departments configured from the Mission Control dashboard.', status: 'Configurable' },
    inspector: {
      kind: 'route',
      title: 'Departments',
      subtitle: 'Agent organisation',
      summary: 'Departments are configured in Mission Control and map OpenClaw agents into organisational groups.',
      fields: [
        { label: 'Source', value: 'data/teams.json' },
        { label: 'Managed from', value: 'Departments > Manage' },
      ],
    },
  },
  {
    id: 'tasks',
    label: 'Tasks',
    path: '/tasks',
    icon: 'tasks',
    preview: { eyebrow: 'Delegations', title: 'Tasks', detail: 'Live delegated work from the operator board, including blockers and ownership.', status: 'Runtime-derived' },
    inspector: {
      kind: 'route',
      title: 'Tasks',
      subtitle: 'Delegation queue',
      summary: 'Task list is derived from live runtime board jobs rather than seeded read models.',
      fields: [
        { label: 'Primary objects', value: 'Delegated jobs and blockers' },
        { label: 'Truth model', value: 'Board-backed live operator state' },
      ],
    },
  },
  {
    id: 'events',
    label: 'Events',
    path: '/events',
    icon: 'events',
    preview: { eyebrow: 'Operational timeline', title: 'Events', detail: 'Recent runtime events only, with degraded status shown explicitly when runtime sources are incomplete.', status: 'Streaming / runtime' },
    inspector: {
      kind: 'route',
      title: 'Events',
      subtitle: 'Operational history',
      summary: 'Recent runtime events and failures surfaced without prototype filler or fake history.',
      fields: [
        { label: 'Mode', value: 'Live runtime timeline' },
        { label: 'Fallback', value: 'Explicit unavailable state only' },
      ],
    },
  },
  {
    id: 'settings',
    label: 'Settings',
    path: '/settings',
    icon: 'settings',
    preview: { eyebrow: 'Control plane', title: 'Runtime settings snapshot', detail: 'Read-only backend configuration and truth metadata reported by the service.', status: 'Read-only' },
    inspector: {
      kind: 'route',
      title: 'Settings',
      subtitle: 'Service-reported configuration',
      summary: 'Read-only view of backend-reported Mission Control settings and truth posture.',
      fields: [
        { label: 'Mode', value: 'Inspection only' },
        { label: 'Writes', value: 'No frontend mutations exposed' },
      ],
    },
  },
];

export const teamSubPages: PageDescriptor[] = [
  {
    id: 'teams-factory-floor',
    label: 'Factory Floor',
    section: 'Departments',
    path: '/teams/factory-floor',
    icon: 'factory',
    preview: { eyebrow: 'Department overview', title: 'Factory Floor', detail: 'Department groupings with agent staffing and task counts.', status: 'Live' },
    inspector: {
      kind: 'route',
      title: 'Factory Floor',
      subtitle: 'Department overview',
      summary: 'Shows departments with staffing and utilization derived from runtime state.',
      fields: [
        { label: 'Source', value: 'data/teams.json + runtime state' },
        { label: 'Grouping', value: 'By department' },
      ],
    },
  },
  {
    id: 'teams-pipeline',
    label: 'Pipeline',
    section: 'Departments',
    path: '/teams/pipeline',
    icon: 'pipeline',
    preview: { eyebrow: 'Queue stages', title: 'Pipeline', detail: 'Task queue stages grouped by department from runtime delegations.', status: 'Live' },
    inspector: {
      kind: 'route',
      title: 'Pipeline',
      subtitle: 'Queue stages by department',
      summary: 'Shows how delegated work is distributed across queue stages per department.',
      fields: [
        { label: 'Source', value: 'Runtime board jobs' },
        { label: 'Grouping', value: 'By department and job state' },
      ],
    },
  },
  {
    id: 'teams-roles',
    label: 'Roles',
    section: 'Departments',
    path: '/teams/roles',
    icon: 'roles',
    preview: { eyebrow: 'Staffing', title: 'Role Coverage', detail: 'Role staffing and availability across departments.', status: 'Live' },
    inspector: {
      kind: 'route',
      title: 'Roles',
      subtitle: 'Role coverage by department',
      summary: 'Shows how many agents fill each role per department and their availability.',
      fields: [
        { label: 'Source', value: 'Agent roles from runtime' },
        { label: 'Metric', value: 'Staffed, available, utilization' },
      ],
    },
  },
  {
    id: 'teams-activity',
    label: 'Activity',
    section: 'Departments',
    path: '/teams/activity',
    icon: 'activity',
    preview: { eyebrow: 'Event history', title: 'Department Activity', detail: 'Runtime events attributed to departments by agent membership.', status: 'Live' },
    inspector: {
      kind: 'route',
      title: 'Activity',
      subtitle: 'Department event timeline',
      summary: 'Daily event counts and incidents grouped by department from runtime events.',
      fields: [
        { label: 'Source', value: 'Runtime events by agent' },
        { label: 'Grouping', value: 'By department and date' },
      ],
    },
  },
  {
    id: 'teams-manage',
    label: 'Manage',
    section: 'Departments',
    path: '/teams/manage',
    icon: 'settings',
    preview: { eyebrow: 'Configuration', title: 'Manage Departments', detail: 'Create, rename, and delete departments. Assign agents to departments.', status: 'Editable' },
    inspector: {
      kind: 'route',
      title: 'Manage Departments',
      subtitle: 'Department configuration',
      summary: 'Create and manage departments. Assign OpenClaw agents to departments from the dashboard.',
      fields: [
        { label: 'Persisted to', value: 'data/teams.json' },
        { label: 'Source', value: 'Mission Control config' },
      ],
    },
  },
];
