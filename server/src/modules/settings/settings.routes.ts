import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAdmin } from '../../lib/requireAdmin.js';
import { getClubSettings, updateClubSettings } from './settings.service.js';

const updateBody = z.object({
  defaultTopValue: z.number().int().optional(),
  defaultRepeatPairingWindow: z.number().int().optional(),
  defaultCountExternalMatches: z.boolean().optional(),
});

export async function settingsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/admin/settings', { preHandler: requireAdmin }, async () => getClubSettings());
  app.patch('/api/admin/settings', { preHandler: requireAdmin }, async (request) =>
    updateClubSettings(updateBody.parse(request.body)),
  );
}
