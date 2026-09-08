import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAdmin } from '../../lib/requireAdmin.js';
import {
  createSeason,
  endSeason,
  getAdminRounds,
  getCurrentSeason,
  getEnrolledPlayers,
  getLiveLeaderboard,
  getNextRoundNumber,
  getPlayerHistory,
  getPublicRounds,
  getSeason,
  listSeasons,
  updateSeasonSettings,
} from './seasons.service.js';

const idParams = z.object({ id: z.coerce.number().int() });
const playerIdParams = z.object({ id: z.coerce.number().int(), playerId: z.coerce.number().int() });
const leaderboardQuery = z.object({ afterRound: z.coerce.number().int().optional() });

const rosterEntrySchema = z.object({
  playerId: z.number().int().optional(),
  newPlayerName: z.string().min(1).optional(),
  membershipType: z.enum(['FULL', 'INTERNAL_ONLY', 'GUEST']).optional(),
  startingValue: z.number().int(),
});
const createSeasonBody = z.object({
  name: z.string().min(1),
  topValue: z.number().int().optional(),
  repeatPairingWindow: z.number().int().optional(),
  countExternalMatches: z.boolean().optional(),
  regularByeCap: z.number().int().optional(),
  knsbTournamentName: z.string().min(1).optional(),
  knsbPlannedEndDate: z.coerce.date().optional(),
  roster: z.array(rosterEntrySchema),
});
const updateSettingsBody = z.object({
  repeatPairingWindow: z.number().int().optional(),
  countExternalMatches: z.boolean().optional(),
  regularByeCap: z.number().int().optional(),
  knsbTournamentName: z.string().min(1).optional(),
  knsbPlannedEndDate: z.coerce.date().nullable().optional(),
});

export async function seasonsRoutes(app: FastifyInstance): Promise<void> {
  // Public
  app.get('/api/seasons', async () => listSeasons());
  app.get('/api/seasons/:id', async (request) => getSeason(idParams.parse(request.params).id));
  app.get('/api/seasons/:id/leaderboard', async (request) => {
    const params = idParams.parse(request.params);
    const query = leaderboardQuery.parse(request.query);
    return getLiveLeaderboard(params.id, query.afterRound);
  });
  app.get('/api/seasons/:id/rounds', async (request) => getPublicRounds(idParams.parse(request.params).id));
  app.get('/api/seasons/:id/players/:playerId/history', async (request) => {
    const params = playerIdParams.parse(request.params);
    return getPlayerHistory(params.id, params.playerId);
  });

  // Admin
  app.get('/api/admin/seasons/current', { preHandler: requireAdmin }, async () => getCurrentSeason());

  app.get('/api/admin/seasons/:id/rounds', { preHandler: requireAdmin }, async (request) =>
    getAdminRounds(idParams.parse(request.params).id),
  );

  app.get('/api/admin/seasons/:id/players', { preHandler: requireAdmin }, async (request) =>
    getEnrolledPlayers(idParams.parse(request.params).id),
  );

  app.post('/api/admin/seasons', { preHandler: requireAdmin }, async (request, reply) => {
    const body = createSeasonBody.parse(request.body);
    const season = await createSeason(body);
    reply.code(201);
    return season;
  });

  app.get('/api/admin/seasons/:id/next-round-number', { preHandler: requireAdmin }, async (request) =>
    getNextRoundNumber(idParams.parse(request.params).id),
  );

  app.post('/api/admin/seasons/:id/end', { preHandler: requireAdmin }, async (request) =>
    endSeason(idParams.parse(request.params).id),
  );

  app.patch('/api/admin/seasons/:id/settings', { preHandler: requireAdmin }, async (request) => {
    const params = idParams.parse(request.params);
    const body = updateSettingsBody.parse(request.body);
    return updateSeasonSettings(params.id, body);
  });
}
