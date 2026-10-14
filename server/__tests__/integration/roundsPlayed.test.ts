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
 * Regression test for the Players admin table's "Rounds" column (rounds
 * played this season) showing 0 for a player who had genuinely played —
 * reported live by Jim. The column used to count RoundSignup rows, but
 * those only cover a round's original "who's in" list at creation time; a
 * player added to a round afterwards (a walk-in matchup, a swapped-in
 * opponent) gets a real GAME entry with no corresponding signup row, so
 * the signup-based count silently missed them. Fixed by reusing
 * getLiveLeaderboard's own `played` count (the same number the Leaderboard
 * page's Played column already shows correctly) instead of a second,
 * divergent definition — see listPlayersWithGuestCounts.
 */
describe('Players admin "Rounds" column (real Postgres): counts actual games played, not just signups', () => {
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

  it("counts a player added to a round's matchup directly, who never got a RoundSignup row", async () => {
    const playerIds: number[] = [];
    for (const name of ['RoundsPlayedWalkInA', 'RoundsPlayedWalkInB']) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/admin/players',
        headers: { cookie },
        payload: { name },
      });
      const id = res.json().id as number;
      playerIds.push(id);
      createdPlayerIds.push(id);
    }
    const [playerA, playerB] = playerIds;

    const seasonRes = await app.inject({
      method: 'POST',
      url: '/api/admin/seasons',
      headers: { cookie },
      payload: {
        name: 'RoundsPlayed Test Season',
        topValue: 100,
        roster: [
          { playerId: playerA, startingValue: 100 },
          { playerId: playerB, startingValue: 100 },
        ],
      },
    });
    seasonId = seasonRes.json().id as number;

    // The round is created with nobody signed up — both players are added
    // afterwards as a direct matchup, the same way a late walk-in gets
    // paired, so neither of them ever gets a RoundSignup row.
    const roundRes = await app.inject({
      method: 'POST',
      url: `/api/admin/seasons/${seasonId}/rounds`,
      headers: { cookie },
      payload: { number: 1, date: '2026-01-01', signedUpPlayerIds: [] },
    });
    const roundId = roundRes.json().id;
    expect(roundRes.json().signups).toEqual([]);

    const matchupRes = await app.inject({
      method: 'POST',
      url: `/api/admin/rounds/${roundId}/matchups`,
      headers: { cookie },
      payload: { playerA: { playerId: playerA }, playerB: { playerId: playerB } },
    });
    const entryId = matchupRes.json().id;

    await app.inject({
      method: 'PATCH',
      url: `/api/admin/rounds/${roundId}/entries/${entryId}`,
      headers: { cookie },
      payload: { result: 'WHITE_WIN' },
    });
    await app.inject({ method: 'POST', url: `/api/admin/rounds/${roundId}/publish`, headers: { cookie } });

    const playersRes = await app.inject({ method: 'GET', url: '/api/admin/players', headers: { cookie } });
    const byId = new Map(playersRes.json().map((p: { id: number; roundsThisSeason: number }) => [p.id, p.roundsThisSeason]));
    expect(byId.get(playerA)).toBe(1);
    expect(byId.get(playerB)).toBe(1);
  });
});
