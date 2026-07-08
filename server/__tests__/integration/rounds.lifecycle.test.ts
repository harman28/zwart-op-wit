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

describe('round lifecycle (real Postgres): create -> edit -> publish -> re-edit after publish', () => {
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

  it(
    'runs the full cycle',
    async () => {
    // 1. Five players (odd count, to exercise the pairing bye).
    const names = ['LifecycleAlice', 'LifecycleBob', 'LifecycleCarol', 'LifecycleDave', 'LifecycleEve'];
    const playerIds: number[] = [];
    for (const name of names) {
      const res = await app.inject({ method: 'POST', url: '/api/admin/players', headers: { cookie }, payload: { name } });
      expect(res.statusCode).toBe(201);
      playerIds.push(res.json().id);
    }
    createdPlayerIds.push(...playerIds);
    const [alice, bob, carol, dave, eve] = playerIds as [number, number, number, number, number];

    // 2. A season, ranked in that order.
    const seasonRes = await app.inject({
      method: 'POST',
      url: '/api/admin/seasons',
      headers: { cookie },
      payload: {
        name: 'Lifecycle Test Season',
        topValue: 105,
        repeatPairingWindow: 6,
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

    // A second POST while this season is still active must 409 (a real domain rule,
    // not the kind of arbitrary sequencing block the failure-proof requirement rules out).
    const duplicateSeason = await app.inject({
      method: 'POST',
      url: '/api/admin/seasons',
      headers: { cookie },
      payload: { name: 'Should be rejected', roster: [] },
    });
    expect(duplicateSeason.statusCode).toBe(409);

    // 3. Create round 1 — 5 signed up, so one pairing bye.
    const createRoundRes = await app.inject({
      method: 'POST',
      url: `/api/admin/seasons/${seasonId}/rounds`,
      headers: { cookie },
      payload: { number: 1, date: '2026-01-05', signedUpPlayerIds: playerIds },
    });
    expect(createRoundRes.statusCode).toBe(201);
    const roundId = createRoundRes.json().id;

    // 4. Fetch the admin view and sanity-check the pairing shape.
    const adminView = await app.inject({ method: 'GET', url: `/api/admin/rounds/${roundId}`, headers: { cookie } });
    expect(adminView.statusCode).toBe(200);
    const round = adminView.json();
    const games = round.entries.filter((e: { kind: string }) => e.kind === 'GAME');
    const pairingBye = round.entries.find((e: { kind: string }) => e.kind === 'PAIRING_BYE');
    expect(games).toHaveLength(2);
    expect(pairingBye.soloPlayerId).toBe(eve); // lowest-ranked signed-up player

    // 5. Enter a result on the first game.
    const firstGame = games[0];
    const enterResult = await app.inject({
      method: 'PATCH',
      url: `/api/admin/rounds/${roundId}/entries/${firstGame.id}`,
      headers: { cookie },
      payload: { result: 'WHITE_WIN' },
    });
    expect(enterResult.statusCode).toBe(200);
    expect(enterResult.json().result).toBe('WHITE_WIN');

    // 6. Renumber tables starting at 9 (the "1-8 reserved for an external match" scenario).
    const renumbered = await app.inject({
      method: 'PATCH',
      url: `/api/admin/rounds/${roundId}/table-numbers`,
      headers: { cookie },
      payload: { startAt: 9 },
    });
    expect(renumbered.statusCode).toBe(200);
    const tableNumbers = renumbered
      .json()
      .map((g: { tableNumber: number }) => g.tableNumber)
      .sort((a: number, b: number) => a - b);
    expect(tableNumbers).toEqual([9, 10]);

    // 7. Before publishing, the public endpoints see nothing.
    const publicRoundsBefore = await app.inject({ method: 'GET', url: `/api/seasons/${seasonId}/rounds` });
    expect(publicRoundsBefore.json()).toEqual([]);

    // 8. Publish.
    const publishRes = await app.inject({ method: 'POST', url: `/api/admin/rounds/${roundId}/publish`, headers: { cookie } });
    expect(publishRes.json().isPublished).toBe(true);

    // Publishing again is a no-op, not an error (idempotent).
    const publishAgain = await app.inject({ method: 'POST', url: `/api/admin/rounds/${roundId}/publish`, headers: { cookie } });
    expect(publishAgain.statusCode).toBe(200);

    // 9. Public rounds view: the pairing bye shows, the regular-bye-eligible-but-absent
    // players (there are none here — everyone signed up) would never be named at all.
    const publicRounds = await app.inject({ method: 'GET', url: `/api/seasons/${seasonId}/rounds` });
    const publicRound = publicRounds.json()[0];
    expect(publicRound.entries.some((e: { kind: string }) => e.kind === 'REGULAR_BYE')).toBe(false);
    expect(publicRound.entries.some((e: { kind: string }) => e.kind === 'PAIRING_BYE')).toBe(true);

    // 10. Live leaderboard reflects the one result entered so far.
    const leaderboardBefore = await app.inject({ method: 'GET', url: `/api/seasons/${seasonId}/leaderboard` });
    // We explicitly set WHITE_WIN above; firstGame.result itself is stale (fetched before that PATCH).
    const winnerId = firstGame.whitePlayerId;
    const winnerStanding = leaderboardBefore.json().standings.find((s: { playerId: number }) => s.playerId === winnerId);
    expect(winnerStanding.played).toBe(1);
    expect(winnerStanding.wins).toBe(1);

    // 11. Re-edit the SAME entry after publish — must work identically to before publish.
    // This is the actual mechanism behind "no hard-blocking sequencing": a mistake entered
    // after the round went out can still just be fixed.
    const correctResult = await app.inject({
      method: 'PATCH',
      url: `/api/admin/rounds/${roundId}/entries/${firstGame.id}`,
      headers: { cookie },
      payload: { result: 'BLACK_WIN' },
    });
    expect(correctResult.statusCode).toBe(200);
    expect(correctResult.json().result).toBe('BLACK_WIN');

    const leaderboardAfter = await app.inject({ method: 'GET', url: `/api/seasons/${seasonId}/leaderboard` });
    const originalWinnerAfterCorrection = leaderboardAfter
      .json()
      .standings.find((s: { playerId: number }) => s.playerId === winnerId);
    expect(originalWinnerAfterCorrection.wins).toBe(0);
    expect(originalWinnerAfterCorrection.losses).toBe(1);

    // 12. The odd-one-out can be turned into a real game ("assign opponent") via the
    // same generic entry editor — no dedicated endpoint needed.
    const assignOpponent = await app.inject({
      method: 'PATCH',
      url: `/api/admin/rounds/${roundId}/entries/${pairingBye.id}`,
      headers: { cookie },
      payload: { kind: 'GAME', soloPlayerId: null, whitePlayerId: eve, blackPlayerId: carol, tableNumber: 11 },
    });
    expect(assignOpponent.statusCode).toBe(200);
    expect(assignOpponent.json().kind).toBe('GAME');
    },
    30_000,
  );
});
