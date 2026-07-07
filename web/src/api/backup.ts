import { api } from './client.js';

export function exportBackup(seasonId: number) {
  return api.get<unknown>(`/admin/seasons/${seasonId}/backup`);
}

export function importBackupReplace(seasonId: number, file: unknown) {
  return api.post(`/admin/backup/import?mode=replace&seasonId=${seasonId}`, file);
}

export function importBackupNewSeason(file: unknown) {
  return api.post('/admin/backup/import?mode=new-season', file);
}
