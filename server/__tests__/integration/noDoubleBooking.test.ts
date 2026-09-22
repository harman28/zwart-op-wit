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
 * Unlike a stale REGULAR_BYE (see staleRegularByeCleanup.test.ts, where
 * silently deleting the bye is always the right call — it's just an
 * absence-tracking artifact superseded by a real entry), a player already
 * holding a real entry (GAME/PAIRING_BYE/EXTERNAL_BYE) in a round and then
 * getting a *second* real entry there is always an admin mistake — there's
 * no automatic "correct" resolution, so this should be rejected outright
 * rather than silently creating a second table for the same player. Nothing
 * enforced this before; see assertNoConflictingEntry in rounds.service.ts.
 */
describe('no double-booking (real Postgres): a player can hold at most one real entry per round', () => {
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

  it('addMatchup rejects pairing a player who already has a real entry in this round', async () => {
    const names = ['DoubleAlice', 'DoubleBob', 'DoubleCarol'];
    const playerIds: number[] = [];
    for (const name of names) {
      const res = await app.inject({ method: 'POST', url: '/api/admin/players', headers: { cookie }, payload: { name } });
      playerIds.push(res.json().id);
    }
    createdPlayerIds.push(...playerIds);
    const [alice, bob, carol] = playerIds as [number, number, number];

    const seasonRes = await app.inject({
      method: 'POST',
      url: '/api/admin/seasons',
      headers: { cookie },
      payload: {
        name: 'No Double Booking Season',
        topValue: 105,
        roster: [
          { playerId: alice, startingValue: 105 },
          { playerId: bob, startingValue: 104 },
          { playerId: carol, startingValue: 103 },
        ],
      },
    });
    seasonId = seasonRes.json().id;

    const round = await app.inject({
      method: 'POST',
      url: `/api/admin/seasons/${seasonId}/rounds`,
      headers: { cookie },
      payload: { number: 1, date: '2026-05-01', signedUpPlayerIds: [alice, bob] },
    });
    const roundId = round.json().id;
    // Alice already has a real GAME entry this round (vs Bob, from pairing).

    // Trying to also pair her against Carol in the same round must be rejected.
    const secondMatchup = await app.inject({
      method: 'POST',
      url: `/api/admin/rounds/${roundId}/matchups`,
      headers: { cookie },
      payload: { playerA: { playerId: alice }, playerB: { playerId: carol } },
    });
    expect(secondMatchup.statusCode).toBe(409);

    // Confirm nothing was actually created — Alice still has exactly one entry.
    const roundAdmin = await app.inject({ method: 'GET', url: `/api/admin/rounds/${roundId}`, headers: { cookie } });
    const aliceEntries = roundAdmin.json().entries.filter(
      (e: { whitePlayerId: number | null; blackPlayerId: number | null }) =>
        e.whitePlayerId === alice || e.blackPlayerId === alice,
    );
    expect(aliceEntries).toHaveLength(1);
  });

  it('updateEntry rejects swapping in a player who already has a different real entry in this round', async () => {
    const names = ['SwapDoubleAlice', 'SwapDoubleBob', 'SwapDoubleCarol', 'SwapDoubleDave'];
    const playerIds: number[] = [];
    for (const name of names) {
      const res = await app.inject({ method: 'POST', url: '/api/admin/players', headers: { cookie }, payload: { name } });
      playerIds.push(res.json().id);
    }
    createdPlayerIds.push(...playerIds);
    const [alice, bob, carol, dave] = playerIds as [number, number, number, number];

    await prisma.season.delete({ where: { id: seasonId } }).catch(() => {});
    const seasonRes = await app.inject({
      method: 'POST',
      url: '/api/admin/seasons',
      headers: { cookie },
      payload: {
        name: 'No Double Booking Swap Season',
        topValue: 105,
        roster: [
          { playerId: alice, startingValue: 105 },
          { playerId: bob, startingValue: 104 },
          { playerId: carol, startingValue: 103 },
          { playerId: dave, startingValue: 102 },
        ],
      },
    });
    seasonId = seasonRes.json().id;

    // Round with two separate tables: Alice-Bob and Carol-Dave.
    const round = await app.inject({
      method: 'POST',
      url: `/api/admin/seasons/${seasonId}/rounds`,
      headers: { cookie },
      payload: { number: 1, date: '2026-05-08', signedUpPlayerIds: [alice, bob, carol, dave] },
    });
    const roundId = round.json().id;
    const carolDaveEntry = round.json().entries.find(
      (e: { whitePlayerId: number | null; blackPlayerId: number | null }) =>
        (e.whitePlayerId === carol && e.blackPlayerId === dave) || (e.whitePlayerId === dave && e.blackPlayerId === carol),
    );
    expect(carolDaveEntry).toBeDefined();
    const daveSide: 'whitePlayerId' | 'blackPlayerId' = carolDaveEntry.whitePlayerId === dave ? 'whitePlayerId' : 'blackPlayerId';

    // Swapping Alice into Dave's seat would give Alice two real entries this
    // round (her existing Alice-Bob table, plus this one) — must be rejected.
    const swapRes = await app.inject({
      method: 'PATCH',
      url: `/api/admin/rounds/${roundId}/entries/${carolDaveEntry.id}`,
      headers: { cookie },
      payload: { [daveSide]: alice },
    });
    expect(swapRes.statusCode).toBe(409);

    // Confirm nothing changed — Dave is still in his original seat.
    const roundAdmin = await app.inject({ method: 'GET', url: `/api/admin/rounds/${roundId}`, headers: { cookie } });
    const entryAfter = roundAdmin.json().entries.find((e: { id: number }) => e.id === carolDaveEntry.id);
    expect(entryAfter[daveSide]).toBe(dave);
  });
});
