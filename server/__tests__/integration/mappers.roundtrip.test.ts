import { afterAll, describe, expect, it } from 'vitest';
import { prisma } from '../../src/db/client.js';
import { replaySeason } from '../../src/engine/standings.js';
import { mapEnrollmentsToBaselines, mapRoundToEngine } from '../../src/lib/mappers.js';

/**
 * Proves the mapper round-trips the club's worked example through *real*
 * Prisma-shaped rows written to and read back from the actual database —
 * not just hand-constructed objects. If this ever regresses, either the
 * schema or the mapper has drifted from what the engine expects.
 */
describe('mappers — DB round-trip (real Postgres)', () => {
  const createdPlayerIds: number[] = [];
  const createdSeasonIds: number[] = [];

  afterAll(async () => {
    for (const seasonId of createdSeasonIds) {
      await prisma.season.delete({ where: { id: seasonId } }).catch(() => {});
    }
    for (const playerId of createdPlayerIds) {
      await prisma.player.delete({ where: { id: playerId } }).catch(() => {});
    }
    await prisma.$disconnect();
  });

  it('reproduces the golden-master worked example after a full write/read round-trip', async () => {
    const names = ['Joppe', 'Jim', 'Maurice', 'Sebastian', 'Wiebe', 'Robbert'];
    const startingValues = [90, 89, 88, 87, 86, 85];

    const players = await Promise.all(
      names.map((name) => prisma.player.create({ data: { name: `RoundtripTest-${name}` } })),
    );
    createdPlayerIds.push(...players.map((p) => p.id));
    const [joppe, jim, maurice, sebastian, wiebe, robbert] = players.map((p) => p.id) as [
      number, number, number, number, number, number,
    ];

    const season = await prisma.season.create({
      data: {
        name: 'Roundtrip Test Season',
        topValue: 90,
        repeatPairingWindow: 6,
        countExternalMatches: true,
        enrollments: {
          create: players.map((p, idx) => ({ playerId: p.id, startingValue: startingValues[idx]! })),
        },
      },
    });
    createdSeasonIds.push(season.id);

    await prisma.round.create({
      data: {
        seasonId: season.id,
        number: 1,
        date: new Date(),
        entries: {
          create: [
            { kind: 'GAME', whitePlayerId: joppe, blackPlayerId: jim, result: 'WHITE_WIN', tableNumber: 1 },
            { kind: 'GAME', whitePlayerId: maurice, blackPlayerId: sebastian, result: 'DRAW', tableNumber: 2 },
            { kind: 'GAME', whitePlayerId: wiebe, blackPlayerId: robbert, result: 'WHITE_WIN', tableNumber: 3 },
          ],
        },
      },
    });

    await prisma.round.create({
      data: {
        seasonId: season.id,
        number: 2,
        date: new Date(),
        entries: {
          create: [
            { kind: 'GAME', whitePlayerId: joppe, blackPlayerId: wiebe, result: 'BLACK_WIN', tableNumber: 1 },
            { kind: 'GAME', whitePlayerId: maurice, blackPlayerId: jim, result: 'WHITE_WIN', tableNumber: 2 },
            { kind: 'PAIRING_BYE', soloPlayerId: sebastian },
            { kind: 'REGULAR_BYE', soloPlayerId: robbert },
          ],
        },
      },
    });

    const seasonWithData = await prisma.season.findUniqueOrThrow({
      where: { id: season.id },
      include: {
        enrollments: true,
        rounds: { include: { entries: true }, orderBy: { number: 'asc' } },
      },
    });

    const replayResult = replaySeason({
      topValue: seasonWithData.topValue,
      baselines: mapEnrollmentsToBaselines(seasonWithData.enrollments),
      rounds: seasonWithData.rounds.map(mapRoundToEngine),
    });

    const round2 = replayResult.byRound[1]!;
    const scoreOf = (playerId: number) => round2.standings.find((s) => s.playerId === playerId)!.score;

    expect(scoreOf(wiebe)).toBeCloseTo(264, 5);
    expect(scoreOf(maurice)).toBeCloseTo(217.5, 5);
    expect(scoreOf(sebastian)).toBeCloseTo(189, 5);
    expect(scoreOf(joppe)).toBeCloseTo(176, 5);
    expect(scoreOf(robbert)).toBeCloseTo(85 + 85 / 3, 5);
    expect(scoreOf(jim)).toBeCloseTo(86, 5);
  });
});
