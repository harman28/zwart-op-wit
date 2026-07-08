import { api } from './client.js';

export interface ActionLogEntry {
  id: number;
  createdAt: string;
  actorName: string | null;
  method: string;
  path: string;
  summary: string;
}

export function listActions(params: { limit?: number; beforeId?: number } = {}) {
  const query = new URLSearchParams();
  if (params.limit) query.set('limit', String(params.limit));
  if (params.beforeId) query.set('beforeId', String(params.beforeId));
  const qs = query.toString();
  return api.get<ActionLogEntry[]>(`/admin/action-log${qs ? `?${qs}` : ''}`);
}
