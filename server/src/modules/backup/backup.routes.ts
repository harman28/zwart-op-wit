import type { FastifyInstance } from 'fastify';
import { requireAdmin } from '../../lib/requireAdmin.js';
import { backupFileSchema } from './backup.schema.js';
import { exportFullBackup, importFullBackup } from './backup.service.js';

export async function backupRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/admin/backup', { preHandler: requireAdmin }, async () => exportFullBackup());

  app.post('/api/admin/backup/import', { preHandler: requireAdmin }, async (request) => {
    const body = backupFileSchema.parse(request.body);
    return importFullBackup(body);
  });
}
