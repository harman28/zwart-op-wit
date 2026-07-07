import { describe, expect, it } from 'vitest';
import { applyExternalOutcome, applyGameResult } from '../results.js';
import { replaySeason } from '../standings.js';
import type { ExternalOutcome, GameEntry, GameOutcome, RoundEntryInput } from '../types.js';

function freshGame(): GameEntry {
  return { kind: 'GAME', whitePlayerId: 1, blackPlayerId: 2, result: null, isSelfArranged: false };
}

describe('applyGameResult', () => {
  it('37. sets all 5 outcome values correctly; rejects an invalid value', () => {
    const outcomes: GameOutcome[] = ['WHITE_WIN', 'BLACK_WIN', 'DRAW', 'WHITE_WIN_FORFEIT', 'BLACK_WIN_FORFEIT'];
    for (const outcome of outcomes) {
      expect(applyGameResult(freshGame(), outcome).result).toBe(outcome);
    }
    expect(() => applyGameResult(freshGame(), 'NOT_A_RESULT' as GameOutcome)).toThrow(/invalid game result/i);
  });

  it('38. throws when called on a non-GAME entry', () => {
    const entry: RoundEntryInput = { kind: 'REGULAR_BYE', playerId: 1 };
    expect(() => applyGameResult(entry, 'WHITE_WIN')).toThrow(/only be called on a GAME entry/i);
  });

  it('39. WHITE_WIN_FORFEIT scores identically to WHITE_WIN (the 1R/0R requirement end-to-end)', () => {
    const baselines = [
      { playerId: 1, startingValue: 100 },
      { playerId: 2, startingValue: 90 },
    ];
    const normal = replaySeason({
      topValue: 100,
      baselines,
      rounds: [{ number: 1, entries: [{ kind: 'GAME', whitePlayerId: 1, blackPlayerId: 2, result: 'WHITE_WIN', isSelfArranged: false }] }],
    });
    const forfeit = replaySeason({
      topValue: 100,
      baselines,
      rounds: [{ number: 1, entries: [{ kind: 'GAME', whitePlayerId: 1, blackPlayerId: 2, result: 'WHITE_WIN_FORFEIT', isSelfArranged: false }] }],
    });
    expect(forfeit.byRound[0]).toEqual(normal.byRound[0]);
  });
});

describe('applyExternalOutcome', () => {
  it('40. only accepts WIN/DRAW/LOSS, and only on an EXTERNAL_BYE entry', () => {
    const entry: RoundEntryInput = { kind: 'EXTERNAL_BYE', playerId: 1, outcome: 'WIN' };
    for (const outcome of ['WIN', 'DRAW', 'LOSS'] as ExternalOutcome[]) {
      expect(applyExternalOutcome(entry, outcome).outcome).toBe(outcome);
    }
    expect(() => applyExternalOutcome(entry, 'BOGUS' as ExternalOutcome)).toThrow(/invalid external outcome/i);
    expect(() => applyExternalOutcome(freshGame(), 'WIN')).toThrow(/only be called on an EXTERNAL_BYE entry/i);
  });
});
