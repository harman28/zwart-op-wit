import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAdmin } from '../../lib/requireAdmin.js';
import {
  archivePlayer,
  createPlayer,
  deletePlayer,
  importPlayers,
  listPlayersWithGuestCounts,
  unarchivePlayer,
  updatePlayer,
} from './players.service.js';

const membershipTypeSchema = z.enum(['FULL', 'INTERNAL_ONLY', 'GUEST']);
const genderSchema = z.enum(['M', 'V', 'X']);
const createBody = z.object({ name: z.string().min(1), membershipType: membershipTypeSchema.default('FULL') });
const importBody = z.object({
  players: z.array(
    z.object({
      name: z.string().min(1),
      membershipType: membershipTypeSchema.default('FULL'),
      federation: z.string().min(1).optional(),
      knsbId: z.string().min(1).optional(),
      gender: genderSchema.optional(),
    }),
  ),
});
const updateBody = z.object({
  name: z.string().min(1).optional(),
  membershipType: membershipTypeSchema.optional(),
  notes: z.string().nullable().optional(),
  gender: genderSchema.nullable().optional(),
  knsbId: z.string().nullable().optional(),
  federation: z.string().min(1).optional(),
});
const idParams = z.object({ id: z.coerce.number().int() });

// DELETE is real but conditional — see deletePlayer in players.service.ts.
// A player who has ever actually appeared in a round (a real RoundEntry or
// RoundSignup) is a historical identity referenced forever; only a player
// with none of that (a typo, a test player, an accidental duplicate) can
// actually be removed. Fix a typo'd name with PATCH instead of delete+recreate.
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

  app.post('/api/admin/players/:id/archive', { preHandler: requireAdmin }, async (request) =>
    archivePlayer(idParams.parse(request.params).id),
  );

  app.post('/api/admin/players/:id/unarchive', { preHandler: requireAdmin }, async (request) =>
    unarchivePlayer(idParams.parse(request.params).id),
  );

  app.delete('/api/admin/players/:id', { preHandler: requireAdmin }, async (request, reply) => {
    await deletePlayer(idParams.parse(request.params).id);
    reply.code(204);
  });
}
