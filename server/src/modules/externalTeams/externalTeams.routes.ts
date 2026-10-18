import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAdmin } from '../../lib/requireAdmin.js';
import {
  createExternalTeam,
  deleteExternalTeam,
  getExternalDivisionStandings,
  listExternalTeams,
  updateExternalTeam,
} from './externalTeams.service.js';

const idParams = z.object({ id: z.coerce.number().int() });
const createBody = z.object({ name: z.string().min(1), netstandUrl: z.string().min(1) });
const updateBody = z.object({ name: z.string().min(1).optional(), netstandUrl: z.string().min(1).optional() });

// Admin-only, no dedicated settings-page UI yet — small, rarely-changed list
// (a club has at most a couple of external league teams), managed directly
// via these endpoints for now rather than building a CRUD screen for it.
export async function externalTeamsRoutes(app: FastifyInstance): Promise<void> {
  // Public — feeds the /embed/external-teams page, same unauthenticated
  // access as the rest of the public leaderboard/round views.
  app.get('/api/external-teams/standings', async () => getExternalDivisionStandings());

  app.get('/api/admin/external-teams', { preHandler: requireAdmin }, async () => listExternalTeams());

  app.post('/api/admin/external-teams', { preHandler: requireAdmin }, async (request, reply) => {
    const body = createBody.parse(request.body);
    const team = await createExternalTeam(body);
    reply.code(201);
    return team;
  });

  app.patch('/api/admin/external-teams/:id', { preHandler: requireAdmin }, async (request) => {
    const params = idParams.parse(request.params);
    const body = updateBody.parse(request.body);
    return updateExternalTeam(params.id, body);
  });

  app.delete('/api/admin/external-teams/:id', { preHandler: requireAdmin }, async (request, reply) => {
    await deleteExternalTeam(idParams.parse(request.params).id);
    reply.code(204);
  });
}
