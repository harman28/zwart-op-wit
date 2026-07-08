import { api } from './client.js';
import type { ClubSettings } from './types.js';

export function getClubSettings() {
  return api.get<ClubSettings>('/admin/settings');
}
export function updateClubSettings(data: Partial<ClubSettings>) {
  return api.patch<ClubSettings>('/admin/settings', data);
}
export function getKnsbExport(seasonId: number, fromRound: number, throughRound: number) {
  return api.get<{ content: string; filename: string }>(
    `/admin/seasons/${seasonId}/knsb-export?fromRound=${fromRound}&throughRound=${throughRound}`,
  );
}
