import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAdmin } from '../../lib/requireAdmin.js';
import { backupFileSchema } from './backup.schema.js';
import { exportSeasonBackup, importSeasonBackup } from './backup.service.js';

const idParams = z.object({ id: z.coerce.number().int() });
const importQuery = z.object({ seasonId: z.coerce.number().int() });

export async function backupRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/admin/seasons/:id/backup', { preHandler: requireAdmin }, async (request) =>
    exportSeasonBackup(idParams.parse(request.params).id),
  );

  app.post('/api/admin/backup/import', { preHandler: requireAdmin }, async (request) => {
    const query = importQuery.parse(request.query);
    const body = backupFileSchema.parse(request.body);
    return importSeasonBackup(body, query.seasonId);
  });
}
