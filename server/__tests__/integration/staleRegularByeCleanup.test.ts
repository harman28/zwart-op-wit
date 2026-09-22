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
 * The actual bug (a real production case: Freerk/Julian/Maarten, all in
 * Round 3 of the club's real season): a player enrolled with no round in
 * mind gets a REGULAR_BYE backfilled into every already-existing round —
 * correctly, at that moment. But if an admin *later*, in a separate call,
 * gives that player a real matchup in one of those already-backfilled
 * rounds, nothing removed the now-stale bye. Both entries scored: the real
 * game's result, plus the bye's ~1/3-of-value credit, every round after.
 *
 * retroactiveBye.test.ts already proves the backfill-at-enrollment-time
 * behavior is correct on its own, and that the one enrollment path with a
 * round in mind (addMatchup/assignOpponent's own "newPlayer" case) is
 * already safe via excludeRoundId. This file is the other half: the three
 * *separate* call sites that enroll with no round context at all — Players
 * tab, bulk import, and restoring an archived player — each followed by a
 * later, independent call that gives that player a real matchup in a round
 * they were already backfilled into. See removeStaleRegularByes in
 * rounds.service.ts for the fix these are regression-testing.
 */
describe('stale REGULAR_BYE cleanup (real Postgres): a player backfilled into a round, then later given a real matchup there', () => {
  const app = buildApp();
  let cookie = '';
  const createdPlayerIds: number[] = [];
  const seasonIds: number[] = [];

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
    for (const id of seasonIds) await prisma.season.delete({ where: { id } }).catch(() => {});
    for (const id of createdPlayerIds) await prisma.player.delete({ where: { id } }).catch(() => {});
    await prisma.adminSession.deleteMany({});
    await app.close();
    await prisma.$disconnect();
  });

  /** Alice/Bob play and publish Round 1 and Round 2 — the "already-existing
   * rounds" a later-enrolled player will be backfilled into. Only one season
   * can be active at a time (createSeason 409s otherwise), and each test
   * below needs its own freshly-active one — so this ends whatever's still
   * active from a previous test first. */
  async function seedSeasonWithTwoPublishedRounds(namePrefix: string) {
    const stillActive = await prisma.season.findFirst({ where: { endedAt: null } });
    if (stillActive) await app.inject({ method: 'POST', url: `/api/admin/seasons/${stillActive.id}/end`, headers: { cookie } });

    // Eve is enrolled but never signed up for round 1/2 — she sits both out
    // (her own REGULAR_BYE backfill), so she's free later for a newcomer's
    // matchup without already holding a real entry, unlike Alice/Bob who
    // play each other every round.
    const names = [`${namePrefix}Alice`, `${namePrefix}Bob`, `${namePrefix}Eve`];
    const playerIds: number[] = [];
    for (const name of names) {
      const res = await app.inject({ method: 'POST', url: '/api/admin/players', headers: { cookie }, payload: { name } });
      playerIds.push(res.json().id);
    }
    createdPlayerIds.push(...playerIds);
    const [alice, bob, eve] = playerIds as [number, number, number];

    const seasonRes = await app.inject({
      method: 'POST',
      url: '/api/admin/seasons',
      headers: { cookie },
      payload: {
        name: `${namePrefix} Season`,
        topValue: 105,
        roster: [
          { playerId: alice, startingValue: 105 },
          { playerId: bob, startingValue: 104 },
          { playerId: eve, startingValue: 103 },
        ],
      },
    });
    const seasonId = seasonRes.json().id as number;
    seasonIds.push(seasonId);

    for (const [number, date] of [[1, '2026-04-01'], [2, '2026-04-08']] as [number, string][]) {
      const round = await app.inject({
        method: 'POST',
        url: `/api/admin/seasons/${seasonId}/rounds`,
        headers: { cookie },
        payload: { number, date, signedUpPlayerIds: [alice, bob] },
      });
      const game = round.json().entries.find((e: { kind: string }) => e.kind === 'GAME');
      await app.inject({
        method: 'PATCH',
        url: `/api/admin/rounds/${round.json().id}/entries/${game.id}`,
        headers: { cookie },
        payload: { result: 'WHITE_WIN' },
      });
      await app.inject({ method: 'POST', url: `/api/admin/rounds/${round.json().id}/publish`, headers: { cookie } });
    }
    const round2 = await prisma.round.findFirstOrThrow({ where: { seasonId, number: 2 } });
    return { seasonId, alice, bob, eve, round2Id: round2.id };
  }

  /** Asserts the newcomer has exactly one entry in round 2 (the real GAME
   * they were added to, not a leftover bye alongside it) and that their
   * public history has no duplicate round numbers at all. */
  async function assertNoStaleByeInRound2(seasonId: number, round2Id: number, playerId: number) {
    const round2Admin = await app.inject({ method: 'GET', url: `/api/admin/rounds/${round2Id}`, headers: { cookie } });
    const entriesInRound2 = round2Admin.json().entries.filter(
      (e: { soloPlayerId: number | null; whitePlayerId: number | null; blackPlayerId: number | null }) =>
        e.soloPlayerId === playerId || e.whitePlayerId === playerId || e.blackPlayerId === playerId,
    );
    expect(entriesInRound2).toHaveLength(1);
    expect(entriesInRound2[0].kind).toBe('GAME');

    const history = await app.inject({ url: `/api/seasons/${seasonId}/players/${playerId}/history` });
    const roundNumbers = (history.json().entries as { roundNumber: number }[]).map((e) => e.roundNumber);
    expect(roundNumbers).toEqual([...new Set(roundNumbers)]); // no round number appears twice
  }

  it('Players-tab enrollment (no round in mind) followed by addMatchup into an already-backfilled round', async () => {
    const { seasonId, eve, round2Id } = await seedSeasonWithTwoPublishedRounds('PlayersTab');

    // The exact Freerk/Julian/Maarten path: "+ Add player" directly into
    // the season, with no round/matchup context at all.
    const enrollRes = await app.inject({
      method: 'POST',
      url: `/api/admin/seasons/${seasonId}/players`,
      headers: { cookie },
      payload: { name: 'PlayersTabCarol', startingValue: 100 },
    });
    const carolId = enrollRes.json().playerId as number;
    createdPlayerIds.push(carolId);

    // Confirm the backfill actually happened first — otherwise the test
    // below wouldn't be exercising the scenario it claims to.
    const round2Before = await app.inject({ method: 'GET', url: `/api/admin/rounds/${round2Id}`, headers: { cookie } });
    const carolByeBefore = round2Before.json().entries.filter((e: { soloPlayerId: number | null }) => e.soloPlayerId === carolId);
    expect(carolByeBefore).toHaveLength(1);
    expect(carolByeBefore[0].kind).toBe('REGULAR_BYE');

    // Separately, later: an admin gives Carol a real matchup in that same round.
    const matchupRes = await app.inject({
      method: 'POST',
      url: `/api/admin/rounds/${round2Id}/matchups`,
      headers: { cookie },
      payload: { playerA: { playerId: carolId }, playerB: { playerId: eve } },
    });
    expect(matchupRes.statusCode).toBe(201);

    await assertNoStaleByeInRound2(seasonId, round2Id, carolId);
  });

  it('bulk roster import (no round in mind) followed by addMatchup into an already-backfilled round', async () => {
    const { seasonId, eve, round2Id } = await seedSeasonWithTwoPublishedRounds('BulkImport');

    const importRes = await app.inject({
      method: 'POST',
      url: '/api/admin/players/import',
      headers: { cookie },
      payload: { players: [{ name: 'BulkImportCarol' }] },
    });
    const carolId = importRes.json()[0].id as number;
    createdPlayerIds.push(carolId);

    const round2Before = await app.inject({ method: 'GET', url: `/api/admin/rounds/${round2Id}`, headers: { cookie } });
    const carolByeBefore = round2Before.json().entries.filter((e: { soloPlayerId: number | null }) => e.soloPlayerId === carolId);
    expect(carolByeBefore).toHaveLength(1);
    expect(carolByeBefore[0].kind).toBe('REGULAR_BYE');

    const matchupRes = await app.inject({
      method: 'POST',
      url: `/api/admin/rounds/${round2Id}/matchups`,
      headers: { cookie },
      payload: { playerA: { playerId: carolId }, playerB: { playerId: eve } },
    });
    expect(matchupRes.statusCode).toBe(201);

    await assertNoStaleByeInRound2(seasonId, round2Id, carolId);
  });

  it('restoring an archived player (no round in mind) followed by addMatchup into an already-backfilled round', async () => {
    const { seasonId, eve, round2Id } = await seedSeasonWithTwoPublishedRounds('Unarchive');

    const createRes = await app.inject({
      method: 'POST',
      url: '/api/admin/players',
      headers: { cookie },
      payload: { name: 'UnarchiveCarol' },
    });
    const carolId = createRes.json().id as number;
    createdPlayerIds.push(carolId);
    await app.inject({ method: 'POST', url: `/api/admin/players/${carolId}/archive`, headers: { cookie } });

    // Restoring her — the season is running, so this enrolls her into it
    // (enrollExistingPlayer) with the same no-round-context backfill.
    const unarchiveRes = await app.inject({ method: 'POST', url: `/api/admin/players/${carolId}/unarchive`, headers: { cookie } });
    expect(unarchiveRes.statusCode).toBe(200);

    const round2Before = await app.inject({ method: 'GET', url: `/api/admin/rounds/${round2Id}`, headers: { cookie } });
    const carolByeBefore = round2Before.json().entries.filter((e: { soloPlayerId: number | null }) => e.soloPlayerId === carolId);
    expect(carolByeBefore).toHaveLength(1);
    expect(carolByeBefore[0].kind).toBe('REGULAR_BYE');

    const matchupRes = await app.inject({
      method: 'POST',
      url: `/api/admin/rounds/${round2Id}/matchups`,
      headers: { cookie },
      payload: { playerA: { playerId: carolId }, playerB: { playerId: eve } },
    });
    expect(matchupRes.statusCode).toBe(201);

    await assertNoStaleByeInRound2(seasonId, round2Id, carolId);
  });

  it('assignOpponent (turning a PAIRING_BYE into a GAME) also cleans up a stale REGULAR_BYE for the newly-assigned opponent', async () => {
    const { seasonId, alice, round2Id } = await seedSeasonWithTwoPublishedRounds('AssignOpp');

    const enrollRes = await app.inject({
      method: 'POST',
      url: `/api/admin/seasons/${seasonId}/players`,
      headers: { cookie },
      payload: { name: 'AssignOppCarol', startingValue: 100 },
    });
    const carolId = enrollRes.json().playerId as number;
    createdPlayerIds.push(carolId);

    // A fresh round where Alice is the odd one out (Bob sits this one out —
    // never enrolled into it — so Alice gets a real PAIRING_BYE to assign
    // Carol onto), independent of round2's own already-settled pairing.
    const round3 = await app.inject({
      method: 'POST',
      url: `/api/admin/seasons/${seasonId}/rounds`,
      headers: { cookie },
      payload: { number: 3, date: '2026-04-15', signedUpPlayerIds: [alice] },
    });
    const round3Id = round3.json().id;
    const alicePairingBye = round3.json().entries.find((e: { kind: string }) => e.kind === 'PAIRING_BYE');
    expect(alicePairingBye).toBeDefined();

    // Carol now has a REGULAR_BYE backfilled into round 3 too (it existed
    // the moment she was enrolled, same as round 1/2).
    const round3Before = await app.inject({ method: 'GET', url: `/api/admin/rounds/${round3Id}`, headers: { cookie } });
    const carolByeInRound3Before = round3Before
      .json()
      .entries.filter((e: { soloPlayerId: number | null }) => e.soloPlayerId === carolId);
    expect(carolByeInRound3Before).toHaveLength(1);
    expect(carolByeInRound3Before[0].kind).toBe('REGULAR_BYE');

    const assignRes = await app.inject({
      method: 'POST',
      url: `/api/admin/rounds/${round3Id}/entries/${alicePairingBye.id}/assign-opponent`,
      headers: { cookie },
      payload: { opponentId: carolId },
    });
    expect(assignRes.statusCode).toBe(200);

    const round3After = await app.inject({ method: 'GET', url: `/api/admin/rounds/${round3Id}`, headers: { cookie } });
    const carolInRound3After = round3After.json().entries.filter(
      (e: { soloPlayerId: number | null; whitePlayerId: number | null; blackPlayerId: number | null }) =>
        e.soloPlayerId === carolId || e.whitePlayerId === carolId || e.blackPlayerId === carolId,
    );
    expect(carolInRound3After).toHaveLength(1);
    expect(carolInRound3After[0].kind).toBe('GAME');

    void round2Id; // unused in this scenario — round 3 is the one under test
  });

  it('addEntry (kind: GAME, the raw/generic entry creator) also cleans up a stale REGULAR_BYE for either player', async () => {
    const { seasonId, round2Id } = await seedSeasonWithTwoPublishedRounds('AddEntry');

    // Two newly-enrolled players, each backfilled into round 2 — kept
    // separate from Alice/Bob's own already-settled round-2 game so this
    // entry is a genuine extra table, not a double-booking of someone who
    // already has a real entry there.
    const carolRes = await app.inject({
      method: 'POST',
      url: `/api/admin/seasons/${seasonId}/players`,
      headers: { cookie },
      payload: { name: 'AddEntryCarol', startingValue: 100 },
    });
    const carolId = carolRes.json().playerId as number;
    createdPlayerIds.push(carolId);
    const doraRes = await app.inject({
      method: 'POST',
      url: `/api/admin/seasons/${seasonId}/players`,
      headers: { cookie },
      payload: { name: 'AddEntryDora', startingValue: 99 },
    });
    const doraId = doraRes.json().playerId as number;
    createdPlayerIds.push(doraId);

    const round2Before = await app.inject({ method: 'GET', url: `/api/admin/rounds/${round2Id}`, headers: { cookie } });
    const carolByeBefore = round2Before.json().entries.filter((e: { soloPlayerId: number | null }) => e.soloPlayerId === carolId);
    expect(carolByeBefore).toHaveLength(1);
    expect(carolByeBefore[0].kind).toBe('REGULAR_BYE');

    // A second, self-arranged table in round 2 — Carol vs Dora — added via
    // the raw addEntry endpoint rather than addMatchup/assignOpponent.
    const addRes = await app.inject({
      method: 'POST',
      url: `/api/admin/rounds/${round2Id}/entries`,
      headers: { cookie },
      payload: { kind: 'GAME', whitePlayerId: carolId, blackPlayerId: doraId, tableNumber: 99 },
    });
    expect(addRes.statusCode).toBe(201);

    await assertNoStaleByeInRound2(seasonId, round2Id, carolId);
  });

  it('updateEntry (swapping a different player into an existing game slot) also cleans up that player\'s stale REGULAR_BYE', async () => {
    const { seasonId, round2Id } = await seedSeasonWithTwoPublishedRounds('SwapPlayer');

    const enrollRes = await app.inject({
      method: 'POST',
      url: `/api/admin/seasons/${seasonId}/players`,
      headers: { cookie },
      payload: { name: 'SwapPlayerCarol', startingValue: 100 },
    });
    const carolId = enrollRes.json().playerId as number;
    createdPlayerIds.push(carolId);

    // Two throwaway extra players to seed a real GAME entry in round 2 that
    // doesn't involve Alice/Bob's own already-settled game — this one gets
    // edited afterward to swap Carol in — the "click a name, pick someone
    // else" admin flow (handleSwapPlayer on the frontend).
    const daveRes = await app.inject({
      method: 'POST',
      url: `/api/admin/seasons/${seasonId}/players`,
      headers: { cookie },
      payload: { name: 'SwapPlayerDave', startingValue: 99 },
    });
    const daveId = daveRes.json().playerId as number;
    createdPlayerIds.push(daveId);
    const fionaRes = await app.inject({
      method: 'POST',
      url: `/api/admin/seasons/${seasonId}/players`,
      headers: { cookie },
      payload: { name: 'SwapPlayerFiona', startingValue: 98 },
    });
    const fionaId = fionaRes.json().playerId as number;
    createdPlayerIds.push(fionaId);

    const matchupRes = await app.inject({
      method: 'POST',
      url: `/api/admin/rounds/${round2Id}/matchups`,
      headers: { cookie },
      payload: { playerA: { playerId: fionaId }, playerB: { playerId: daveId } },
    });
    const entry = matchupRes.json();
    const daveSide: 'whitePlayerId' | 'blackPlayerId' = entry.whitePlayerId === daveId ? 'whitePlayerId' : 'blackPlayerId';

    const round2Before = await app.inject({ method: 'GET', url: `/api/admin/rounds/${round2Id}`, headers: { cookie } });
    const carolByeBefore = round2Before.json().entries.filter((e: { soloPlayerId: number | null }) => e.soloPlayerId === carolId);
    expect(carolByeBefore).toHaveLength(1);
    expect(carolByeBefore[0].kind).toBe('REGULAR_BYE');

    // Swap Carol in for Dave — same shape as the frontend's handleSwapPlayer.
    const swapRes = await app.inject({
      method: 'PATCH',
      url: `/api/admin/rounds/${round2Id}/entries/${entry.id}`,
      headers: { cookie },
      payload: { [daveSide]: carolId },
    });
    expect(swapRes.statusCode).toBe(200);

    await assertNoStaleByeInRound2(seasonId, round2Id, carolId);
  });
});
