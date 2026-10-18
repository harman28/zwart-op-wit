import { api } from './client.js';
import type { ExternalDivisionStandings } from './types.js';

export function getExternalDivisionStandings() {
  return api.get<ExternalDivisionStandings[]>('/external-teams/standings');
}
