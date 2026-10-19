import { describe, expect, it } from 'vitest';
import { playerGameHistory, replaySeason } from '../standings.js';
import {
  JIM,
  JOPPE,
  MAURICE,
  ROBBERT,
  SEBASTIAN,
  WIEBE,
  workedExampleInput,
} from './fixtures/workedExample.js';

describe('playerGameHistory — same worked example as the golden-master standings test', () => {
  const result = replaySeason(workedExampleInput);
  const currentScore = (playerId: number) =>
    result.current.standings.find((s) => s.playerId === playerId)!.score;

  it('startingValue + sum(entries.points) equals the current score exactly — for every player', () => {
    for (const b of workedExampleInput.baselines) {
      const history = playerGameHistory(workedExampleInput, b.playerId);
      const total = history.startingValue + history.entries.reduce((sum, e) => sum + e.points, 0);
      expect(total).toBeCloseTo(currentScore(b.playerId), 5);
    }
  });

  it("Joppe's history: starts from his round-1 ending value (90), round 1 win vs Jim (rebased to Jim's round-2 value, 86), round 2 loss vs Wiebe (0)", () => {
    const history = playerGameHistory(workedExampleInput, JOPPE);
    expect(history.startingValue).toBe(90);
    expect(history.entries).toEqual([
      { roundNumber: 1, kind: 'GAME', opponentId: JIM, opponentRank: 5, opponentOfCount: 6, ownRank: 1, ownFieldSize: 6, color: 'WHITE', result: 'WHITE_WIN', externalOutcome: null, isSelfArranged: false, points: 86 },
      { roundNumber: 2, kind: 'GAME', opponentId: WIEBE, opponentRank: 1, opponentOfCount: 6, ownRank: 4, ownFieldSize: 6, color: 'WHITE', result: 'BLACK_WIN', externalOutcome: null, isSelfArranged: false, points: 0 },
    ]);
    // Joppe was rank 1 after round 1 (his best), dropped to 4 after round 2.
    expect(history.peakRank).toEqual({ rank: 1, roundNumber: 1, ofCount: 6 });
    // Joppe's baseline (90) was the highest of all six, so rank 1 before any round too.
    expect(history.startingRank).toEqual({ rank: 1, ofCount: 6 });
  });

  it("Sebastian's history: starts from his round-1 ending value (87), round 1 draw vs Maurice as Black (rebased to 44), round 2 pairing bye (58)", () => {
    const history = playerGameHistory(workedExampleInput, SEBASTIAN);
    expect(history.startingValue).toBe(87);
    expect(history.entries).toEqual([
      { roundNumber: 1, kind: 'GAME', opponentId: MAURICE, opponentRank: 3, opponentOfCount: 6, ownRank: 4, ownFieldSize: 6, color: 'BLACK', result: 'DRAW', externalOutcome: null, isSelfArranged: false, points: 44 },
      { roundNumber: 2, kind: 'PAIRING_BYE', opponentId: null, opponentRank: null, opponentOfCount: null, ownRank: 3, ownFieldSize: 6, color: null, result: null, externalOutcome: null, isSelfArranged: false, points: 58 },
    ]);
    // Sebastian was rank 4 after round 1, improved to rank 3 (his best) after round 2.
    expect(history.peakRank).toEqual({ rank: 3, roundNumber: 2, ofCount: 6 });
    // Sebastian's baseline (87) was 4th highest of six.
    expect(history.startingRank).toEqual({ rank: 4, ofCount: 6 });
  });

  it("Robbert's history: starts from his round-1 ending value (85), round 1 loss vs Wiebe as Black (0), round 2 regular bye (85/3)", () => {
    const history = playerGameHistory(workedExampleInput, ROBBERT);
    expect(history.startingValue).toBe(85);
    expect(history.entries).toEqual([
      { roundNumber: 1, kind: 'GAME', opponentId: WIEBE, opponentRank: 2, opponentOfCount: 6, ownRank: 6, ownFieldSize: 6, color: 'BLACK', result: 'WHITE_WIN', externalOutcome: null, isSelfArranged: false, points: 0 },
      { roundNumber: 2, kind: 'REGULAR_BYE', opponentId: null, opponentRank: null, opponentOfCount: null, ownRank: 5, ownFieldSize: 6, color: null, result: null, externalOutcome: null, isSelfArranged: false, points: 85 / 3 },
    ]);
    // Robbert was rank 6 after round 1, improved to rank 5 (his best) after round 2.
    expect(history.peakRank).toEqual({ rank: 5, roundNumber: 2, ofCount: 6 });
    // Robbert's baseline (85) was the lowest of all six, so rank 6 before any round too.
    expect(history.startingRank).toEqual({ rank: 6, ofCount: 6 });
  });

  it('a player with no rounds played yet gets an empty history, their raw baseline as startingValue, and no peak rank — but still a startingRank, since that comes from the baselines alone', () => {
    const history = playerGameHistory({ ...workedExampleInput, rounds: [] }, JOPPE);
    expect(history.startingValue).toBe(90);
    expect(history.entries).toEqual([]);
    expect(history.peakRank).toBeNull();
    expect(history.startingRank).toEqual({ rank: 1, ofCount: 6 });
  });

  it("includes the player's own standing row from the same replay — the record/summary shown above the round-by-round table", () => {
    const history = playerGameHistory(workedExampleInput, JOPPE);
    expect(history.standing).toEqual(result.current.standings.find((s) => s.playerId === JOPPE));
  });

  it('fieldSize is the current ranked field size (all 6 baseline players), even before any round has been played', () => {
    expect(playerGameHistory(workedExampleInput, JOPPE).fieldSize).toBe(6);
    expect(playerGameHistory({ ...workedExampleInput, rounds: [] }, JOPPE).fieldSize).toBe(6);
  });
});
