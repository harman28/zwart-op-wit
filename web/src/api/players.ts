import { api } from './client.js';
import type { MembershipType, Player } from './types.js';

export function listPlayers() {
  return api.get<Player[]>('/admin/players');
}
export function createPlayer(name: string, membershipType?: MembershipType) {
  return api.post<Player>('/admin/players', { name, membershipType });
}
export function importPlayers(players: { name: string; membershipType?: MembershipType }[]) {
  return api.post<Player[]>('/admin/players/import', { players });
}
export function updatePlayer(
  id: number,
  data: { name?: string; membershipType?: MembershipType; notes?: string | null },
) {
  return api.patch<Player>(`/admin/players/${id}`, data);
}
