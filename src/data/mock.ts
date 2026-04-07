import type { InspectorPayload, PreviewCard } from '../types';

export const hoverPreviewFallback: PreviewCard = {
  eyebrow: 'Operator surface',
  title: 'Live Mission Control',
  detail: 'Hover routes and runtime entities to inspect live operator context. Surfaces remain empty or unavailable instead of inventing demo state.',
  status: 'Live / truthful only',
};

export const inspectorDefault: InspectorPayload = {
  kind: 'route',
  title: 'Inspector',
  subtitle: 'Select a live surface',
  summary: 'Choose a route or runtime entity to pin truthful Mission Control context here.',
  fields: [
    { label: 'Interaction', value: 'Hover for preview, click to pin' },
    { label: 'Fallback rule', value: 'Degraded or unavailable beats fake data' },
  ],
};
