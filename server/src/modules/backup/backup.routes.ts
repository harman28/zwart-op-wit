import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAdmin } from '../../lib/requireAdmin.js';
import { backupFileSchema } from './backup.schema.js';
import { exportSeasonBackup, importSeasonBackup } from './backup.service.js';

const idParams = z.object({ id: z.coerce.number().int() });
const importQuery = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('replace'), seasonId: z.coerce.number().int() }),
  z.object({ mode: z.literal('new-season') }),
]);

export async function backupRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/admin/seasons/:id/backup', { preHandler: requireAdmin }, async (request) =>
    exportSeasonBackup(idParams.parse(request.params).id),
  );

  app.post('/api/admin/backup/import', { preHandler: requireAdmin }, async (request) => {
    const query = importQuery.parse(request.query);
    const body = backupFileSchema.parse(request.body);
    return query.mode === 'replace'
      ? importSeasonBackup(body, { mode: 'replace', seasonId: query.seasonId })
      : importSeasonBackup(body, { mode: 'new-season' });
  });
}
