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

describe('current leaderboard (real Postgres): stays frozen until a round is fully entered', () => {
  const app = buildApp();
  let cookie = '';
  const createdPlayerIds: number[] = [];
  let seasonId = -1;

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
    await prisma.adminSession.deleteMany({});
    await app.close();
    await prisma.$disconnect();
  });

  it('does not move the current view until every result in the new round is entered, not just one', async () => {
    // 5 players (odd, so round 2 will have a pairing bye — the exact
    // reported scenario: "the lowest ranked player gets her unpaired bye,
    // and nobody else receives any points").
    const names = ['FreezeAlice', 'FreezeBob', 'FreezeCarol', 'FreezeDave', 'FreezeEve'];
    const playerIds: number[] = [];
    for (const name of names) {
      const res = await app.inject({ method: 'POST', url: '/api/admin/players', headers: { cookie }, payload: { name } });
      expect(res.statusCode).toBe(201);
      playerIds.push(res.json().id);
    }
    createdPlayerIds.push(...playerIds);
    const [alice, bob, carol, dave, eve] = playerIds as [number, number, number, number, number];

    const seasonRes = await app.inject({
      method: 'POST',
      url: '/api/admin/seasons',
      headers: { cookie },
      payload: {
        name: 'Freeze Test Season',
        topValue: 105,
        roster: [
          { playerId: alice, startingValue: 105 },
          { playerId: bob, startingValue: 104 },
          { playerId: carol, startingValue: 103 },
          { playerId: dave, startingValue: 102 },
          { playerId: eve, startingValue: 101 },
        ],
      },
    });
    expect(seasonRes.statusCode).toBe(201);
    seasonId = seasonRes.json().id;

    // Round 1: play it out fully and publish.
    const round1 = await app.inject({
      method: 'POST',
      url: `/api/admin/seasons/${seasonId}/rounds`,
      headers: { cookie },
      payload: { number: 1, date: '2026-01-05', signedUpPlayerIds: playerIds },
    });
    expect(round1.statusCode).toBe(201);
    const round1Id = round1.json().id;
    const round1Games = round1.json().entries.filter((e: { kind: string }) => e.kind === 'GAME');
    for (const game of round1Games) {
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/admin/rounds/${round1Id}/entries/${game.id}`,
        headers: { cookie },
        payload: { result: 'WHITE_WIN' },
      });
      expect(res.statusCode).toBe(200);
    }
    await app.inject({ method: 'POST', url: `/api/admin/rounds/${round1Id}/publish`, headers: { cookie } });

    const afterRound1 = await app.inject({ method: 'GET', url: `/api/seasons/${seasonId}/leaderboard` });
    expect(afterRound1.statusCode).toBe(200);
    const round1Standings = afterRound1.json().standings;

    // Round 2: create and publish, but enter NO results at all yet.
    const round2 = await app.inject({
      method: 'POST',
      url: `/api/admin/seasons/${seasonId}/rounds`,
      headers: { cookie },
      payload: { number: 2, date: '2026-01-12', signedUpPlayerIds: playerIds },
    });
    expect(round2.statusCode).toBe(201);
    const round2Id = round2.json().id;
    const pairingBye = round2.json().entries.find((e: { kind: string }) => e.kind === 'PAIRING_BYE');
    expect(pairingBye).toBeDefined(); // confirms this round does have an auto-resolved bye, same as the report
    const round2Games = round2.json().entries.filter((e: { kind: string }) => e.kind === 'GAME');
    await app.inject({ method: 'POST', url: `/api/admin/rounds/${round2Id}/publish`, headers: { cookie } });

    // The current (default) leaderboard must be UNCHANGED from right after
    // round 1 — the round 2 pairing bye alone must not move it.
    const afterRound2Published = await app.inject({ method: 'GET', url: `/api/seasons/${seasonId}/leaderboard` });
    expect(afterRound2Published.statusCode).toBe(200);
    expect(afterRound2Published.json().standings).toEqual(round1Standings);
    expect(afterRound2Published.json().roundNumber).toBe(1);

    // The explicit "after round 2" view is unaffected by this freeze — it's
    // a deliberate ask and shows round 2's real (partial) state, bye included.
    const explicitRound2 = await app.inject({
      method: 'GET',
      url: `/api/seasons/${seasonId}/leaderboard?afterRound=2`,
    });
    expect(explicitRound2.statusCode).toBe(200);
    expect(explicitRound2.json().standings).not.toEqual(round1Standings);

    // 5 players, 1 pairing bye => 2 GAME entries in round 2. Entering just the
    // first one must NOT move the current view — one result isn't "the round
    // is fully entered" while its sibling game is still outstanding.
    expect(round2Games.length).toBe(2);
    await app.inject({
      method: 'PATCH',
      url: `/api/admin/rounds/${round2Id}/entries/${round2Games[0].id}`,
      headers: { cookie },
      payload: { result: 'WHITE_WIN' },
    });
    const afterFirstRound2Result = await app.inject({ method: 'GET', url: `/api/seasons/${seasonId}/leaderboard` });
    expect(afterFirstRound2Result.statusCode).toBe(200);
    expect(afterFirstRound2Result.json().standings).toEqual(round1Standings);
    expect(afterFirstRound2Result.json().roundNumber).toBe(1);

    // Entering the round's LAST outstanding result is what moves it forward.
    await app.inject({
      method: 'PATCH',
      url: `/api/admin/rounds/${round2Id}/entries/${round2Games[1].id}`,
      headers: { cookie },
      payload: { result: 'WHITE_WIN' },
    });
    const afterAllRound2Results = await app.inject({ method: 'GET', url: `/api/seasons/${seasonId}/leaderboard` });
    expect(afterAllRound2Results.statusCode).toBe(200);
    expect(afterAllRound2Results.json().standings).not.toEqual(round1Standings);
    expect(afterAllRound2Results.json().roundNumber).toBe(2);
  });
});
