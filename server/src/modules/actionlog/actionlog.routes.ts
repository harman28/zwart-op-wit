import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAdmin } from '../../lib/requireAdmin.js';
import { listActions } from './actionlog.service.js';

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
  beforeId: z.coerce.number().int().optional(),
});

export async function actionLogRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/admin/action-log', { preHandler: requireAdmin }, async (request) => {
    const query = querySchema.parse(request.query);
    return listActions({ limit: query.limit ?? 50, beforeId: query.beforeId });
  });
}
