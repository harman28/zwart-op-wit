import { api } from './client.js';

export function exportBackup() {
  return api.get<unknown>('/admin/backup');
}

export function importBackupReplace(file: unknown) {
  return api.post('/admin/backup/import', file);
}
