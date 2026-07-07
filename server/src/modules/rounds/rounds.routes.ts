import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAdmin } from '../../lib/requireAdmin.js';
import {
  addEntry,
  createRound,
  deleteEntry,
  deleteRound,
  getRoundAdmin,
  publishRound,
  renumberTables,
  updateEntry,
  updateRound,
} from './rounds.service.js';

const seasonIdParams = z.object({ id: z.coerce.number().int() });
const roundIdParams = z.object({ id: z.coerce.number().int() });
const entryIdParams = z.object({ id: z.coerce.number().int(), entryId: z.coerce.number().int() });

const membershipTypeSchema = z.enum(['FULL', 'INTERNAL_ONLY', 'GUEST']);
const gameResultSchema = z.enum(['WHITE_WIN', 'BLACK_WIN', 'DRAW', 'WHITE_WIN_FORFEIT', 'BLACK_WIN_FORFEIT']);
const externalOutcomeSchema = z.enum(['WIN', 'DRAW', 'LOSS']);
const entryKindSchema = z.enum(['GAME', 'PAIRING_BYE', 'REGULAR_BYE', 'EXTERNAL_BYE']);

const createRoundBody = z.object({
  number: z.number().int(),
  date: z.coerce.date(),
  signedUpPlayerIds: z.array(z.number().int()),
  newPlayers: z
    .array(
      z.object({
        name: z.string().min(1),
        membershipType: membershipTypeSchema.optional(),
        startingValue: z.number().int(),
      }),
    )
    .optional(),
});

const updateRoundBody = z.object({ number: z.number().int().optional(), date: z.coerce.date().optional() });

const updateEntryBody = z.object({
  kind: entryKindSchema.optional(),
  whitePlayerId: z.number().int().nullable().optional(),
  blackPlayerId: z.number().int().nullable().optional(),
  soloPlayerId: z.number().int().nullable().optional(),
  result: gameResultSchema.nullable().optional(),
  externalOutcome: externalOutcomeSchema.nullable().optional(),
  isSelfArranged: z.boolean().optional(),
  tableNumber: z.number().int().nullable().optional(),
});

const addEntryBody = z.object({
  kind: entryKindSchema,
  whitePlayerId: z.number().int().optional(),
  blackPlayerId: z.number().int().optional(),
  soloPlayerId: z.number().int().optional(),
  result: gameResultSchema.optional(),
  externalOutcome: externalOutcomeSchema.optional(),
  isSelfArranged: z.boolean().optional(),
  tableNumber: z.number().int().optional(),
});

const tableNumbersBody = z.object({ startAt: z.number().int() });

export async function roundsRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/admin/seasons/:id/rounds', { preHandler: requireAdmin }, async (request, reply) => {
    const params = seasonIdParams.parse(request.params);
    const body = createRoundBody.parse(request.body);
    const round = await createRound(params.id, body);
    reply.code(201);
    return round;
  });

  app.get('/api/admin/rounds/:id', { preHandler: requireAdmin }, async (request) =>
    getRoundAdmin(roundIdParams.parse(request.params).id),
  );

  app.patch('/api/admin/rounds/:id', { preHandler: requireAdmin }, async (request) => {
    const params = roundIdParams.parse(request.params);
    const body = updateRoundBody.parse(request.body);
    return updateRound(params.id, body);
  });

  app.patch('/api/admin/rounds/:id/entries/:entryId', { preHandler: requireAdmin }, async (request) => {
    const params = entryIdParams.parse(request.params);
    const body = updateEntryBody.parse(request.body);
    return updateEntry(params.entryId, body);
  });

  app.post('/api/admin/rounds/:id/entries', { preHandler: requireAdmin }, async (request, reply) => {
    const params = roundIdParams.parse(request.params);
    const body = addEntryBody.parse(request.body);
    const entry = await addEntry(params.id, body);
    reply.code(201);
    return entry;
  });

  app.delete('/api/admin/rounds/:id/entries/:entryId', { preHandler: requireAdmin }, async (request, reply) => {
    const params = entryIdParams.parse(request.params);
    await deleteEntry(params.entryId);
    reply.code(204);
  });

  app.patch('/api/admin/rounds/:id/table-numbers', { preHandler: requireAdmin }, async (request) => {
    const params = roundIdParams.parse(request.params);
    const body = tableNumbersBody.parse(request.body);
    return renumberTables(params.id, body.startAt);
  });

  app.post('/api/admin/rounds/:id/publish', { preHandler: requireAdmin }, async (request) =>
    publishRound(roundIdParams.parse(request.params).id),
  );

  app.delete('/api/admin/rounds/:id', { preHandler: requireAdmin }, async (request, reply) => {
    const params = roundIdParams.parse(request.params);
    await deleteRound(params.id);
    reply.code(204);
  });
}
