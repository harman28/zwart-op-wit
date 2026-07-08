import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAdmin } from '../../lib/requireAdmin.js';
import { createPlayer, importPlayers, listPlayersWithGuestCounts, updatePlayer } from './players.service.js';

const membershipTypeSchema = z.enum(['FULL', 'INTERNAL_ONLY', 'GUEST']);
const createBody = z.object({ name: z.string().min(1), membershipType: membershipTypeSchema.default('FULL') });
const importBody = z.object({
  players: z.array(z.object({ name: z.string().min(1), membershipType: membershipTypeSchema.default('FULL') })),
});
const updateBody = z.object({
  name: z.string().min(1).optional(),
  membershipType: membershipTypeSchema.optional(),
  notes: z.string().nullable().optional(),
});
const idParams = z.object({ id: z.coerce.number().int() });

// No DELETE — players are historical identities referenced by RoundEntry
// rows forever. Fix a typo'd name with PATCH, don't recreate the player.
export async function playersRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/admin/players', { preHandler: requireAdmin }, async () => listPlayersWithGuestCounts());

  app.post('/api/admin/players', { preHandler: requireAdmin }, async (request, reply) => {
    const body = createBody.parse(request.body);
    const player = await createPlayer(body.name, body.membershipType);
    reply.code(201);
    return player;
  });

  app.post('/api/admin/players/import', { preHandler: requireAdmin }, async (request) => {
    const body = importBody.parse(request.body);
    return importPlayers(body.players);
  });

  app.patch('/api/admin/players/:id', { preHandler: requireAdmin }, async (request) => {
    const params = idParams.parse(request.params);
    const body = updateBody.parse(request.body);
    return updatePlayer(params.id, body);
  });
}
