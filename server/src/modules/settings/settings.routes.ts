import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAdmin } from '../../lib/requireAdmin.js';
import { getClubSettings, updateClubSettings } from './settings.service.js';

const updateBody = z.object({
  defaultTopValue: z.number().int().optional(),
  defaultRepeatPairingWindow: z.number().int().optional(),
  defaultCountExternalMatches: z.boolean().optional(),
  defaultRegularByeCap: z.number().int().optional(),
  defaultKnsbArbiterName: z.string().min(1).optional(),
  defaultKnsbArbiterEmail: z.string().min(1).optional(),
});

export async function settingsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/admin/settings', { preHandler: requireAdmin }, async () => getClubSettings());
  app.patch('/api/admin/settings', { preHandler: requireAdmin }, async (request) =>
    updateClubSettings(updateBody.parse(request.body)),
  );
}
