import type { FastifyInstance } from 'fastify';
import { requireAdmin } from '../../lib/requireAdmin.js';

// Stub only — the real KNSB rapid-rating export format is unknown until a
// sample export is obtained from the old system. No logic beyond this message.
export async function knsbRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/admin/knsb-export', { preHandler: requireAdmin }, async () => ({
    status: 'not_configured',
    message: 'Needs a sample export file from the old system before this can be built.',
  }));
}
