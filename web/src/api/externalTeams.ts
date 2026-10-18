import { api } from './client.js';
import type { ExternalDivisionStandings, TeamDetails } from './types.js';

export function getExternalDivisionStandings() {
  return api.get<ExternalDivisionStandings[]>('/external-teams/standings');
}

export function getTeamDetails(id: number) {
  return api.get<TeamDetails>(`/external-teams/${id}/details`);
}
