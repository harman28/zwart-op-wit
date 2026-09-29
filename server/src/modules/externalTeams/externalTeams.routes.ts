import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAdmin } from '../../lib/requireAdmin.js';
import { createExternalTeam, deleteExternalTeam, listExternalTeams, updateExternalTeam } from './externalTeams.service.js';
import { findPairingUrlInTeamPageHtml, parseBoardNumbersFromPairingHtml } from './netstandScrape.js';

const idParams = z.object({ id: z.coerce.number().int() });
const createBody = z.object({ name: z.string().min(1), netstandUrl: z.string().min(1) });
const updateBody = z.object({ name: z.string().min(1).optional(), netstandUrl: z.string().min(1).optional() });
const debugQuery = z.object({ netstandUrl: z.string().min(1), date: z.coerce.date() });

// Admin-only, no dedicated settings-page UI yet — small, rarely-changed list
// (a club has at most a couple of external league teams), managed directly
// via these endpoints for now rather than building a CRUD screen for it.
export async function externalTeamsRoutes(app: FastifyInstance): Promise<void> {
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

  // TEMPORARY — diagnosing the live board-number auto-fill against the real
  // netstand.nl (this sandbox can't reach it to test directly). Remove once
  // the live behavior is confirmed working correctly. Never writes anything.
  app.get('/api/admin/external-teams/debug-fetch', { preHandler: requireAdmin }, async (request) => {
    let pairingUrl: string | null = null;
    try {
      const query = debugQuery.parse(request.query);
      const teamRes = await fetch(query.netstandUrl, { signal: AbortSignal.timeout(8000) });
      const teamHtml = await teamRes.text();
      pairingUrl = findPairingUrlInTeamPageHtml(teamHtml, query.date, query.netstandUrl);
      let pairingStatus: number | null = null;
      let pairingHtmlLength: number | null = null;
      let boards: Record<string, number> = {};
      if (pairingUrl) {
        const pairingRes = await fetch(pairingUrl, { signal: AbortSignal.timeout(8000) });
        pairingStatus = pairingRes.status;
        const pairingHtml = await pairingRes.text();
        pairingHtmlLength = pairingHtml.length;
        boards = Object.fromEntries(parseBoardNumbersFromPairingHtml(pairingHtml, query.netstandUrl));
      }
      return {
        teamFetchStatus: teamRes.status,
        teamHtmlLength: teamHtml.length,
        teamHtmlSnippet: teamHtml.slice(0, 300),
        pairingUrl,
        pairingStatus,
        pairingHtmlLength,
        boards,
      };
    } catch (err) {
      return {
        caught: true,
        pairingUrlAtFailure: pairingUrl,
        message: err instanceof Error ? err.message : String(err),
        name: err instanceof Error ? err.name : null,
        stack: err instanceof Error ? err.stack : null,
      };
    }
  });
}
