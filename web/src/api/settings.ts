import { api } from './client.js';
import type { ClubSettings } from './types.js';

export function getClubSettings() {
  return api.get<ClubSettings>('/admin/settings');
}
export function updateClubSettings(data: Partial<ClubSettings>) {
  return api.patch<ClubSettings>('/admin/settings', data);
}
export function getKnsbExportStatus() {
  return api.get<{ status: string; message: string }>('/admin/knsb-export');
}
