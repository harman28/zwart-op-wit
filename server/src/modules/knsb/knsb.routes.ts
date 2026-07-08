import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAdmin } from '../../lib/requireAdmin.js';
import { generateSeasonKnsbExport } from './knsb.service.js';

const idParams = z.object({ id: z.coerce.number().int() });
const exportQuery = z.object({ fromRound: z.coerce.number().int(), throughRound: z.coerce.number().int() });

export async function knsbRoutes(app: FastifyInstance): Promise<void> {
  // Same {content, filename} shape the backup export uses — the frontend
  // Blobs it and triggers a download the same way in both places.
  app.get('/api/admin/seasons/:id/knsb-export', { preHandler: requireAdmin }, async (request) => {
    const params = idParams.parse(request.params);
    const query = exportQuery.parse(request.query);
    const content = await generateSeasonKnsbExport(params.id, query.fromRound, query.throughRound);
    return { content, filename: `knsb-rapid-r${query.fromRound}-r${query.throughRound}.txt` };
  });
}
