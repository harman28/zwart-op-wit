import { describe, expect, it } from 'vitest';
import { generatePairings } from '../pairing.js';
import type { GeneratePairingsInput, PairingCandidate } from '../types.js';

function candidates(ids: number[]): PairingCandidate[] {
  return ids.map((playerId, idx) => ({ playerId, rank: idx + 1, colorNumber: 0 }));
}

function baseInput(overrides: Partial<GeneratePairingsInput> = {}): GeneratePairingsInput {
  return {
    currentRoundNumber: 10,
    repeatPairingWindow: 6,
    signedUpPlayerIds: [],
    standings: [],
    pastPairings: [],
    priorPairingByeCounts: {},
    ...overrides,
  };
}

function pairSets(pairings: ReturnType<typeof generatePairings>['pairings']) {
  return pairings
    .filter((p) => p.kind === 'GAME')
    .map((p) => new Set([p.whitePlayerId, p.blackPlayerId]));
}

function hasPair(sets: Set<number>[], a: number, b: number) {
  return sets.some((s) => s.has(a) && s.has(b) && s.size === 2);
}

describe('generatePairings', () => {
  it('22. even count, no conflicts -> the doc\'s exact round-1 pairing (1v2, 3v4, 5v6)', () => {
    const ids = [1, 2, 3, 4, 5, 6]; // Joppe Jim Maurice Sebastian Wiebe Robbert, in rank order
    const result = generatePairings(baseInput({ signedUpPlayerIds: ids, standings: candidates(ids) }));
    const sets = pairSets(result.pairings);
    expect(sets).toHaveLength(3);
    expect(hasPair(sets, 1, 2)).toBe(true);
    expect(hasPair(sets, 3, 4)).toBe(true);
    expect(hasPair(sets, 5, 6)).toBe(true);
    expect(result.warnings).toEqual([]);
  });

  it('23. odd count -> pairing bye always goes to the lowest-ranked signed-up player under their cap', () => {
    const ids = [1, 2, 3, 4, 5];
    const plain = generatePairings(baseInput({ signedUpPlayerIds: ids, standings: candidates(ids) }));
    expect(plain.pairings.find((p) => p.kind === 'PAIRING_BYE')).toEqual({ kind: 'PAIRING_BYE', playerId: 5 });

    // Reversed rank order (id 5 now ranked 1st) -> the bye follows rank, not id.
    const reversedIds = [5, 4, 3, 2, 1];
    const reversed = generatePairings(
      baseInput({ signedUpPlayerIds: reversedIds, standings: candidates(reversedIds) }),
    );
    expect(reversed.pairings.find((p) => p.kind === 'PAIRING_BYE')).toEqual({ kind: 'PAIRING_BYE', playerId: 1 });

    // Lowest-ranked player already capped -> falls to the next-lowest still under cap.
    const capped = generatePairings(
      baseInput({ signedUpPlayerIds: ids, standings: candidates(ids), priorPairingByeCounts: { 5: 1 } }),
    );
    expect(capped.pairings.find((p) => p.kind === 'PAIRING_BYE')).toEqual({ kind: 'PAIRING_BYE', playerId: 4 });
  });

  it('24. table numbers default sequential from 1 in pairing order', () => {
    const ids = [1, 2, 3, 4];
    const result = generatePairings(baseInput({ signedUpPlayerIds: ids, standings: candidates(ids) }));
    const games = result.pairings.filter((p) => p.kind === 'GAME');
    expect(games.map((g) => g.tableNumber)).toEqual([1, 2]);
  });

  it('25. two players paired within the window are never re-paired even when rank-adjacency suggests it', () => {
    const ids = [1, 2, 3, 4];
    const result = generatePairings(
      baseInput({
        signedUpPlayerIds: ids,
        standings: candidates(ids),
        pastPairings: [{ playerAId: 1, playerBId: 2, roundNumber: 9 }],
      }),
    );
    const sets = pairSets(result.pairings);
    expect(hasPair(sets, 1, 2)).toBe(false);
    expect(hasPair(sets, 1, 3)).toBe(true);
    expect(hasPair(sets, 2, 4)).toBe(true);
    expect(result.warnings).toEqual([]);
  });

  it('26. boundary: forbidden exactly `window` rounds ago, allowed the round after that', () => {
    const ids = [1, 2, 3, 4];
    // window=6, currentRound=10: played at round 4 -> 10-4=6=window -> still forbidden.
    const stillForbidden = generatePairings(
      baseInput({
        signedUpPlayerIds: ids,
        standings: candidates(ids),
        pastPairings: [{ playerAId: 1, playerBId: 2, roundNumber: 4 }],
      }),
    );
    expect(hasPair(pairSets(stillForbidden.pairings), 1, 2)).toBe(false);

    // played at round 3 -> 10-3=7>window(6) -> allowed again.
    const allowedAgain = generatePairings(
      baseInput({
        signedUpPlayerIds: ids,
        standings: candidates(ids),
        pastPairings: [{ playerAId: 1, playerBId: 2, roundNumber: 3 }],
      }),
    );
    expect(hasPair(pairSets(allowedAgain.pairings), 1, 2)).toBe(true);
  });

  it('27. the same history produces different legal pairings at window=0 vs 3 vs 6', () => {
    const ids = [1, 2, 3, 4];
    const pastPairings = [{ playerAId: 1, playerBId: 2, roundNumber: 8 }];
    const window0 = generatePairings(
      baseInput({ signedUpPlayerIds: ids, standings: candidates(ids), pastPairings, repeatPairingWindow: 0 }),
    );
    const window3 = generatePairings(
      baseInput({ signedUpPlayerIds: ids, standings: candidates(ids), pastPairings, repeatPairingWindow: 3 }),
    );
    const window6 = generatePairings(
      baseInput({ signedUpPlayerIds: ids, standings: candidates(ids), pastPairings, repeatPairingWindow: 6 }),
    );
    // currentRound=10, played at round 8 -> 2 rounds ago.
    expect(hasPair(pairSets(window0.pairings), 1, 2)).toBe(true); // 2 > 0 -> allowed
    expect(hasPair(pairSets(window3.pairings), 1, 2)).toBe(false); // 2 <= 3 -> forbidden
    expect(hasPair(pairSets(window6.pairings), 1, 2)).toBe(false); // 2 <= 6 -> forbidden
  });

  it('28. a player who already used their 1 pairing bye and is again the odd one out still gets it again, with a warning', () => {
    const ids = [1, 2, 3, 4, 5];
    const result = generatePairings(
      baseInput({ signedUpPlayerIds: ids, standings: candidates(ids), priorPairingByeCounts: { 1: 1, 2: 1, 3: 1, 4: 1, 5: 1 } }),
    );
    expect(result.pairings.find((p) => p.kind === 'PAIRING_BYE')).toEqual({ kind: 'PAIRING_BYE', playerId: 5 });
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('29. a small-pool deadlock (everyone remaining has played everyone within the window) still returns full pairings, never throws', () => {
    const ids = [1, 2, 3, 4];
    const pastPairings = [
      { playerAId: 1, playerBId: 2, roundNumber: 9 },
      { playerAId: 1, playerBId: 3, roundNumber: 9 },
      { playerAId: 1, playerBId: 4, roundNumber: 9 },
      { playerAId: 2, playerBId: 3, roundNumber: 9 },
      { playerAId: 2, playerBId: 4, roundNumber: 9 },
      { playerAId: 3, playerBId: 4, roundNumber: 9 },
    ];
    expect(() =>
      generatePairings(baseInput({ signedUpPlayerIds: ids, standings: candidates(ids), pastPairings })),
    ).not.toThrow();
    const result = generatePairings(baseInput({ signedUpPlayerIds: ids, standings: candidates(ids), pastPairings }));
    expect(pairSets(result.pairings)).toHaveLength(2);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('30. determinism: identical input twice produces identical output', () => {
    const ids = [1, 2, 3, 4, 5, 6];
    const input = baseInput({ signedUpPlayerIds: ids, standings: candidates(ids) });
    const first = generatePairings(input);
    const second = generatePairings(input);
    expect(second).toEqual(first);
  });

  it('31. a brand-new unregistered player is paired purely by the rank/colorNumber the caller supplies, no special-casing', () => {
    // player 99 is "brand new" (no season history) but the caller has assigned it a rank like anyone else.
    const standings: PairingCandidate[] = [
      { playerId: 1, rank: 1, colorNumber: 0 },
      { playerId: 99, rank: 2, colorNumber: 0 },
      { playerId: 3, rank: 3, colorNumber: 0 },
      { playerId: 4, rank: 4, colorNumber: 0 },
    ];
    const result = generatePairings(baseInput({ signedUpPlayerIds: [1, 99, 3, 4], standings }));
    expect(hasPair(pairSets(result.pairings), 1, 99)).toBe(true);
  });
});
