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

describe('retroactive byes (real Postgres): a player enrolled mid-season is backfilled for rounds before they joined', () => {
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

  it('backfills a REGULAR_BYE for rounds that already existed when a brand-new player is added, and never doubles up the round they actually join', async () => {
    const names = ['RetroAlice', 'RetroBob'];
    const playerIds: number[] = [];
    for (const name of names) {
      const res = await app.inject({ method: 'POST', url: '/api/admin/players', headers: { cookie }, payload: { name } });
      playerIds.push(res.json().id);
    }
    createdPlayerIds.push(...playerIds);
    const [alice, bob] = playerIds as [number, number];

    const seasonRes = await app.inject({
      method: 'POST',
      url: '/api/admin/seasons',
      headers: { cookie },
      payload: {
        name: 'Retro Bye Test Season',
        topValue: 105,
        roster: [
          { playerId: alice, startingValue: 105 },
          { playerId: bob, startingValue: 104 },
        ],
      },
    });
    seasonId = seasonRes.json().id;

    // Round 1: just Alice and Bob, played out and published.
    const round1 = await app.inject({
      method: 'POST',
      url: `/api/admin/seasons/${seasonId}/rounds`,
      headers: { cookie },
      payload: { number: 1, date: '2026-02-01', signedUpPlayerIds: [alice, bob] },
    });
    const round1Id = round1.json().id;
    const round1Game = round1.json().entries.find((e: { kind: string }) => e.kind === 'GAME');
    await app.inject({
      method: 'PATCH',
      url: `/api/admin/rounds/${round1Id}/entries/${round1Game.id}`,
      headers: { cookie },
      payload: { result: 'WHITE_WIN' },
    });
    await app.inject({ method: 'POST', url: `/api/admin/rounds/${round1Id}/publish`, headers: { cookie } });

    // Round 2: create it with a brand-new player added on the spot — the
    // exact reported scenario (a debutant added while pairing round 2).
    const round2 = await app.inject({
      method: 'POST',
      url: `/api/admin/seasons/${seasonId}/rounds`,
      headers: { cookie },
      payload: {
        number: 2,
        date: '2026-02-08',
        signedUpPlayerIds: [alice, bob],
        newPlayers: [{ name: 'RetroCarol', startingValue: 100 }],
      },
    });
    expect(round2.statusCode).toBe(201);
    const round2Id = round2.json().id;

    const enrolled = await app.inject({ method: 'GET', url: `/api/admin/seasons/${seasonId}/players`, headers: { cookie } });
    const carol = enrolled.json().find((p: { name: string }) => p.name === 'RetroCarol');
    expect(carol).toBeDefined();
    createdPlayerIds.push(carol.id);

    // Round 1 (already existed) now carries a retroactive REGULAR_BYE for Carol.
    const round1Admin = await app.inject({ method: 'GET', url: `/api/admin/rounds/${round1Id}`, headers: { cookie } });
    const carolInRound1 = round1Admin.json().entries.filter((e: { soloPlayerId: number | null }) => e.soloPlayerId === carol.id);
    expect(carolInRound1).toHaveLength(1);
    expect(carolInRound1[0].kind).toBe('REGULAR_BYE');

    // Round 2 (the round she actually joined in) must NOT also carry a
    // REGULAR_BYE for her — only her real pairing entry.
    const round2Admin = await app.inject({ method: 'GET', url: `/api/admin/rounds/${round2Id}`, headers: { cookie } });
    const carolInRound2 = round2Admin.json().entries.filter(
      (e: { soloPlayerId: number | null; whitePlayerId: number | null; blackPlayerId: number | null }) =>
        e.soloPlayerId === carol.id || e.whitePlayerId === carol.id || e.blackPlayerId === carol.id,
    );
    expect(carolInRound2).toHaveLength(1);
    expect(carolInRound2[0].kind).not.toBe('REGULAR_BYE');

    // Player history only reflects published rounds — publish round 2 so
    // both of Carol's rounds show up: round 1 as a bye with real points,
    // round 2 as her actual game/bye, instead of round 1 being silently
    // missing (the reported bug).
    await app.inject({ method: 'POST', url: `/api/admin/rounds/${round2Id}/publish`, headers: { cookie } });
    const history = await app.inject({ url: `/api/seasons/${seasonId}/players/${carol.id}/history` });
    const entries = history.json().entries as { roundNumber: number; kind: string; points: number }[];
    const round1Entry = entries.find((e) => e.roundNumber === 1);
    expect(round1Entry).toBeDefined();
    expect(round1Entry!.kind).toBe('REGULAR_BYE');
    expect(round1Entry!.points).toBeGreaterThan(0);
    expect(entries.find((e) => e.roundNumber === 2)).toBeDefined();

    // Round 3: assign a second brand-new player straight onto an existing
    // pairing bye (assignOpponent's newOpponent path) — same backfill must
    // apply for rounds 1-2, and round 3 itself (the one being edited) must
    // not get an extra bye for them either.
    const round3 = await app.inject({
      method: 'POST',
      url: `/api/admin/seasons/${seasonId}/rounds`,
      headers: { cookie },
      payload: { number: 3, date: '2026-02-15', signedUpPlayerIds: [alice] },
    });
    const round3Id = round3.json().id;
    const alicePairingBye = round3.json().entries.find((e: { kind: string }) => e.kind === 'PAIRING_BYE');
    expect(alicePairingBye).toBeDefined();

    const assignRes = await app.inject({
      method: 'POST',
      url: `/api/admin/rounds/${round3Id}/entries/${alicePairingBye.id}/assign-opponent`,
      headers: { cookie },
      payload: { newOpponent: { name: 'RetroDave', startingValue: 99 } },
    });
    expect(assignRes.statusCode).toBe(200);

    const enrolledAfter = await app.inject({ method: 'GET', url: `/api/admin/seasons/${seasonId}/players`, headers: { cookie } });
    const dave = enrolledAfter.json().find((p: { name: string }) => p.name === 'RetroDave');
    createdPlayerIds.push(dave.id);

    await app.inject({ method: 'POST', url: `/api/admin/rounds/${round3Id}/publish`, headers: { cookie } });
    const daveHistory = await app.inject({ url: `/api/seasons/${seasonId}/players/${dave.id}/history` });
    const daveEntries = daveHistory.json().entries as { roundNumber: number; kind: string }[];
    expect(daveEntries.map((e) => e.roundNumber).sort()).toEqual([1, 2, 3]);
    expect(daveEntries.find((e) => e.roundNumber === 1)!.kind).toBe('REGULAR_BYE');
    expect(daveEntries.find((e) => e.roundNumber === 2)!.kind).toBe('REGULAR_BYE');
    expect(daveEntries.find((e) => e.roundNumber === 3)!.kind).toBe('GAME');

    // Only one season can be active at a time — free the slot for the next test.
    await app.inject({ method: 'POST', url: `/api/admin/seasons/${seasonId}/end`, headers: { cookie } });
  });

  it("respects the season's regularByeCap — a player joining after more rounds than the cap allows only gets backfilled up to the cap, earliest round first", async () => {
    const names = ['CapAlice', 'CapBob'];
    const playerIds: number[] = [];
    for (const name of names) {
      const res = await app.inject({ method: 'POST', url: '/api/admin/players', headers: { cookie }, payload: { name } });
      playerIds.push(res.json().id);
    }
    createdPlayerIds.push(...playerIds);
    const [alice, bob] = playerIds as [number, number];

    const seasonRes = await app.inject({
      method: 'POST',
      url: '/api/admin/seasons',
      headers: { cookie },
      payload: {
        name: 'Retro Bye Cap Test Season',
        topValue: 105,
        regularByeCap: 1,
        roster: [
          { playerId: alice, startingValue: 105 },
          { playerId: bob, startingValue: 104 },
        ],
      },
    });
    const capSeasonId = seasonRes.json().id;

    // Rounds 1 and 2: just Alice and Bob, played out and published — two
    // rounds a debutant in round 3 will have missed.
    for (const [number, date] of [[1, '2026-03-01'], [2, '2026-03-08']] as [number, string][]) {
      const round = await app.inject({
        method: 'POST',
        url: `/api/admin/seasons/${capSeasonId}/rounds`,
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
    const round1 = await prisma.round.findFirstOrThrow({ where: { seasonId: capSeasonId, number: 1 } });
    const round2 = await prisma.round.findFirstOrThrow({ where: { seasonId: capSeasonId, number: 2 } });

    // Round 3: a brand-new player joins, with regularByeCap = 1 — they
    // missed 2 rounds but can only ever bank 1 regular bye.
    const round3 = await app.inject({
      method: 'POST',
      url: `/api/admin/seasons/${capSeasonId}/rounds`,
      headers: { cookie },
      payload: {
        number: 3,
        date: '2026-03-15',
        signedUpPlayerIds: [alice, bob],
        newPlayers: [{ name: 'CapCarol', startingValue: 100 }],
      },
    });
    expect(round3.statusCode).toBe(201);

    const enrolled = await app.inject({ method: 'GET', url: `/api/admin/seasons/${capSeasonId}/players`, headers: { cookie } });
    const carol = enrolled.json().find((p: { name: string }) => p.name === 'CapCarol');
    createdPlayerIds.push(carol.id);

    // Only round 1 (the earliest miss) gets backfilled; round 2 gets nothing
    // — the cap is spent, exactly as it would be for an absentee who was
    // already enrolled.
    const round1Admin = await app.inject({ method: 'GET', url: `/api/admin/rounds/${round1.id}`, headers: { cookie } });
    const carolInRound1 = round1Admin.json().entries.filter((e: { soloPlayerId: number | null }) => e.soloPlayerId === carol.id);
    expect(carolInRound1).toHaveLength(1);
    expect(carolInRound1[0].kind).toBe('REGULAR_BYE');

    const round2Admin = await app.inject({ method: 'GET', url: `/api/admin/rounds/${round2.id}`, headers: { cookie } });
    const carolInRound2 = round2Admin.json().entries.filter((e: { soloPlayerId: number | null }) => e.soloPlayerId === carol.id);
    expect(carolInRound2).toHaveLength(0);

    await prisma.season.delete({ where: { id: capSeasonId } }).catch(() => {});
  });
});
