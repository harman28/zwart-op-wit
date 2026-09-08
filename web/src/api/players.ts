import { api } from './client.js';
import type { Gender, MembershipType, Player } from './types.js';

export function listPlayers() {
  return api.get<Player[]>('/admin/players');
}
export function createPlayer(name: string, membershipType?: MembershipType) {
  return api.post<Player>('/admin/players', { name, membershipType });
}
export function importPlayers(
  players: { name: string; membershipType?: MembershipType; federation?: string; knsbId?: string; gender?: Gender }[],
) {
  return api.post<Player[]>('/admin/players/import', { players });
}
export function updatePlayer(
  id: number,
  data: {
    name?: string;
    membershipType?: MembershipType;
    notes?: string | null;
    gender?: Gender | null;
    knsbId?: string | null;
    federation?: string;
  },
) {
  return api.patch<Player>(`/admin/players/${id}`, data);
}
export function archivePlayer(id: number) {
  return api.post<Player>(`/admin/players/${id}/archive`);
}
export function unarchivePlayer(id: number) {
  return api.post<Player>(`/admin/players/${id}/unarchive`);
}
