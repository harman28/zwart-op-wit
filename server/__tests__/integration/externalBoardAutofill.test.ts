import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { prisma } from '../../src/db/client.js';
import { env } from '../../src/env.js';
import { ensureClubSettings } from '../../src/modules/auth/auth.service.js';

function extractCookie(setCookieHeader: string | string[] | undefined): string {
  const header = Array.isArray(setCookieHeader) ? setCookieHeader[0] : setCookieHeader;
  if (!header) throw new Error('no set-cookie header in response');
  return header.split(';')[0]!;
}

/**
 * The netstand board-number auto-fill (see tryAutoFillBoardNumber in
 * rounds.service.ts) is best-effort by design — setting an external result's
 * outcome must never fail or hang just because the lookup did. This sandbox
 * can't reach the real netstand.nl either (same as it would be down/
 * unreachable in a real production hiccup), so exercising it for real here
 * doubles as exactly that guarantee: the outcome PATCH still succeeds, still
 * responds promptly, and leaves tableNumber untouched when the lookup can't
 * complete. Parsing itself is covered separately (netstandScrape.test.ts,
 * against real saved HTML) — this only proves the wiring never blocks.
 */
describe('external result outcome + board-number auto-fill (real Postgres): the auto-fill never blocks setting a result', () => {
  const app = buildApp();
  let cookie = '';
  const createdPlayerIds: number[] = [];
  let seasonId = -1;
  let teamId = -1;

  beforeAll(async () => {
    await ensureClubSettings();
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { password: env.ADMIN_INITIAL_PASSWORD, name: 'Tester' },
    });
    cookie = extractCookie(loginRes.headers['set-cookie']);
  });

  afterAll(async () => {
    if (seasonId !== -1) await prisma.season.delete({ where: { id: seasonId } }).catch(() => {});
    for (const id of createdPlayerIds) await prisma.player.delete({ where: { id } }).catch(() => {});
    if (teamId !== -1) await prisma.externalTeam.delete({ where: { id: teamId } }).catch(() => {});
    await prisma.adminSession.deleteMany({});
    await app.close();
    await prisma.$disconnect();
  });

  it('setting an external outcome for a player with a netstand team assigned still succeeds even when the lookup fails', async () => {
    const teamRes = await app.inject({
      method: 'POST',
      url: '/api/admin/external-teams',
      headers: { cookie },
      payload: { name: 'AutofillTest Team', netstandUrl: 'https://sga.netstand.nl/teams/view/752' },
    });
    expect(teamRes.statusCode).toBe(201);
    teamId = teamRes.json().id;

    const playerRes = await app.inject({
      method: 'POST',
      url: '/api/admin/players',
      headers: { cookie },
      payload: { name: 'AutofillAlice' },
    });
    const playerId = playerRes.json().id as number;
    createdPlayerIds.push(playerId);

    const assignTeam = await app.inject({
      method: 'PATCH',
      url: `/api/admin/players/${playerId}`,
      headers: { cookie },
      payload: { externalTeamId: teamId },
    });
    expect(assignTeam.statusCode).toBe(200);

    const seasonRes = await app.inject({
      method: 'POST',
      url: '/api/admin/seasons',
      headers: { cookie },
      payload: { name: 'Autofill Test Season', topValue: 105, roster: [{ playerId, startingValue: 100 }] },
    });
    seasonId = seasonRes.json().id;

    const roundRes = await app.inject({
      method: 'POST',
      url: `/api/admin/seasons/${seasonId}/rounds`,
      headers: { cookie },
      payload: { number: 1, date: '2026-09-28', signedUpPlayerIds: [] },
    });
    const roundId = roundRes.json().id;

    const entryRes = await app.inject({
      method: 'POST',
      url: `/api/admin/rounds/${roundId}/entries`,
      headers: { cookie },
      payload: { kind: 'EXTERNAL_BYE', soloPlayerId: playerId },
    });
    expect(entryRes.statusCode).toBe(201);
    const entryId = entryRes.json().id;

    // The action under test: setting the outcome triggers the auto-fill
    // attempt server-side. This environment can't reach netstand.nl (same
    // network restriction a real outage would look like from the app's
    // side) — the point is that this PATCH still returns 200 promptly
    // rather than hanging or erroring because the lookup couldn't complete.
    const start = Date.now();
    const outcomeRes = await app.inject({
      method: 'PATCH',
      url: `/api/admin/rounds/${roundId}/entries/${entryId}`,
      headers: { cookie },
      payload: { externalOutcome: 'WIN' },
    });
    const elapsedMs = Date.now() - start;

    expect(outcomeRes.statusCode).toBe(200);
    expect(outcomeRes.json().externalOutcome).toBe('WIN');
    // tableNumber stays unset — the lookup couldn't complete, and nothing
    // should fabricate a board number when that happens.
    expect(outcomeRes.json().tableNumber).toBeNull();
    // Bounded by the scraper's own fetch timeout (8s) plus normal overhead —
    // proves this didn't hang waiting on an unreachable host.
    expect(elapsedMs).toBeLessThan(15_000);
  }, 20_000);

  it("never overwrites a board number that's already set", async () => {
    const playerRes = await app.inject({
      method: 'POST',
      url: '/api/admin/players',
      headers: { cookie },
      payload: { name: 'AutofillBob' },
    });
    const playerId = playerRes.json().id as number;
    createdPlayerIds.push(playerId);
    await app.inject({
      method: 'PATCH',
      url: `/api/admin/players/${playerId}`,
      headers: { cookie },
      payload: { externalTeamId: teamId },
    });

    const roundRes = await app.inject({
      method: 'POST',
      url: `/api/admin/seasons/${seasonId}/rounds`,
      headers: { cookie },
      payload: { number: 2, date: '2026-10-05', signedUpPlayerIds: [] },
    });
    const roundId = roundRes.json().id;

    const entryRes = await app.inject({
      method: 'POST',
      url: `/api/admin/rounds/${roundId}/entries`,
      headers: { cookie },
      payload: { kind: 'EXTERNAL_BYE', soloPlayerId: playerId, tableNumber: 4 },
    });
    const entryId = entryRes.json().id;
    expect(entryRes.json().tableNumber).toBe(4);

    const outcomeRes = await app.inject({
      method: 'PATCH',
      url: `/api/admin/rounds/${roundId}/entries/${entryId}`,
      headers: { cookie },
      payload: { externalOutcome: 'LOSS' },
    });
    expect(outcomeRes.statusCode).toBe(200);
    // Already had a manually-entered board number — must survive untouched.
    expect(outcomeRes.json().tableNumber).toBe(4);
  }, 20_000);
});
