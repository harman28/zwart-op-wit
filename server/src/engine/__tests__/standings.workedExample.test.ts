import { describe, expect, it } from 'vitest';
import { replaySeason } from '../standings.js';
import {
  JIM,
  JOPPE,
  MAURICE,
  ROBBERT,
  SEBASTIAN,
  WIEBE,
  workedExampleInput,
} from './fixtures/workedExample.js';

function scoreOf(standings: { playerId: number; score: number }[], playerId: number) {
  const row = standings.find((s) => s.playerId === playerId);
  if (!row) throw new Error(`player ${playerId} not found in standings`);
  return row.score;
}

function rankOf(standings: { playerId: number; rank: number }[], playerId: number) {
  const row = standings.find((s) => s.playerId === playerId);
  if (!row) throw new Error(`player ${playerId} not found in standings`);
  return row.rank;
}

describe('replaySeason — golden master (club rules doc worked example, topValue=90)', () => {
  const result = replaySeason(workedExampleInput);
  const round1 = result.byRound[0]!;
  const round2 = result.byRound[1]!;

  it('1. round-1 scores exactly match the doc', () => {
    expect(scoreOf(round1.standings, JOPPE)).toBeCloseTo(179, 5);
    expect(scoreOf(round1.standings, WIEBE)).toBeCloseTo(171, 5);
    expect(scoreOf(round1.standings, MAURICE)).toBeCloseTo(131.5, 5);
    expect(scoreOf(round1.standings, SEBASTIAN)).toBeCloseTo(131, 5);
    expect(scoreOf(round1.standings, JIM)).toBeCloseTo(89, 5);
    expect(scoreOf(round1.standings, ROBBERT)).toBeCloseTo(85, 5);
  });

  it('2. round-1 -> round-2 value snapshot exactly matches the doc', () => {
    const valueOf = (id: number) => round1.standings.find((s) => s.playerId === id)!.value;
    expect(valueOf(JOPPE)).toBe(90);
    expect(valueOf(WIEBE)).toBe(89);
    expect(valueOf(MAURICE)).toBe(88);
    expect(valueOf(SEBASTIAN)).toBe(87);
    expect(valueOf(JIM)).toBe(86);
    expect(valueOf(ROBBERT)).toBe(85);
  });

  it('3. round-2 final scores exactly match the doc', () => {
    expect(scoreOf(round2.standings, JOPPE)).toBeCloseTo(176, 5);
    expect(scoreOf(round2.standings, WIEBE)).toBeCloseTo(264, 5);
    expect(scoreOf(round2.standings, MAURICE)).toBeCloseTo(217.5, 5);
    expect(scoreOf(round2.standings, SEBASTIAN)).toBeCloseTo(189, 5);
    expect(scoreOf(round2.standings, JIM)).toBeCloseTo(86, 5);
    expect(scoreOf(round2.standings, ROBBERT)).toBeCloseTo(113.33, 1.5e-2);
  });

  it('4. round-2 final rank order matches the doc', () => {
    expect(rankOf(round2.standings, WIEBE)).toBe(1);
    expect(rankOf(round2.standings, MAURICE)).toBe(2);
    expect(rankOf(round2.standings, SEBASTIAN)).toBe(3);
    expect(rankOf(round2.standings, JOPPE)).toBe(4);
    expect(rankOf(round2.standings, ROBBERT)).toBe(5);
    expect(rankOf(round2.standings, JIM)).toBe(6);
  });

  it('5. regression lock: Joppe round-1 win vs Jim is rebased to use Jim\'s round-2 value (86), not round-1 (89)', () => {
    // Joppe round-2 score = own(90) + 86 (rebased round-1 win vs Jim) + 0 (round-2 loss vs Wiebe) = 176.
    // If this ever used Jim's original round-1 value of 89, Joppe's total would wrongly be 179.
    expect(scoreOf(round2.standings, JOPPE)).toBeCloseTo(176, 5);
    expect(scoreOf(round2.standings, JOPPE)).not.toBeCloseTo(179, 5);
  });

  it('6. Robbert\'s round-2 regular bye contributes 1/3 of his round-2 value (85/3 = 28.33)', () => {
    // Robbert: own(85) + 0 (round-1 loss vs Wiebe) + 28.33 (regular bye) = 113.33
    expect(scoreOf(round2.standings, ROBBERT)).toBeCloseTo(85 + 85 / 3, 5);
  });

  it('7. Sebastian\'s round-2 pairing bye contributes 2/3 of his round-2 value (87 * 2/3 = 58)', () => {
    // Sebastian: own(87) + 44 (round-1 draw vs Maurice, rebased) + 58 (pairing bye) = 189
    expect(scoreOf(round2.standings, SEBASTIAN)).toBeCloseTo(87 + 44 + 58, 5);
  });

  it('8. `current` equals the last entry of `byRound`', () => {
    expect(result.current).toEqual(result.byRound[result.byRound.length - 1]);
  });

  it('9. re-run with topValue=120 preserves rank order and shifts the scale proportionally', () => {
    const scaled = replaySeason({ ...workedExampleInput, topValue: 120 });
    const scaledRound2 = scaled.byRound[1]!;
    expect(rankOf(scaledRound2.standings, WIEBE)).toBe(1);
    expect(rankOf(scaledRound2.standings, MAURICE)).toBe(2);
    expect(rankOf(scaledRound2.standings, SEBASTIAN)).toBe(3);
    expect(rankOf(scaledRound2.standings, JOPPE)).toBe(4);
    expect(rankOf(scaledRound2.standings, ROBBERT)).toBe(5);
    expect(rankOf(scaledRound2.standings, JIM)).toBe(6);
    // topValue is a real parameter, not a hidden constant: the scale actually changes.
    expect(scoreOf(scaledRound2.standings, WIEBE)).not.toBeCloseTo(264, 5);
  });

  it('41. full end-to-end snapshot: the entire SeasonReplayResult matches a hand-written expectation', () => {
    expect(result).toEqual({
      byRound: [
        {
          roundNumber: 1,
          standings: [
            { playerId: JOPPE, rank: 1, value: 90, score: 179, played: 1, wins: 1, draws: 0, losses: 0, winPercent: 100, colorNumber: 1, regularByesUsed: 0, pairingByeUsed: false, selfArrangedUsed: 0 },
            { playerId: WIEBE, rank: 2, value: 89, score: 171, played: 1, wins: 1, draws: 0, losses: 0, winPercent: 100, colorNumber: 1, regularByesUsed: 0, pairingByeUsed: false, selfArrangedUsed: 0 },
            { playerId: MAURICE, rank: 3, value: 88, score: 131.5, played: 1, wins: 0, draws: 1, losses: 0, winPercent: 50, colorNumber: 1, regularByesUsed: 0, pairingByeUsed: false, selfArrangedUsed: 0 },
            { playerId: SEBASTIAN, rank: 4, value: 87, score: 131, played: 1, wins: 0, draws: 1, losses: 0, winPercent: 50, colorNumber: -1, regularByesUsed: 0, pairingByeUsed: false, selfArrangedUsed: 0 },
            { playerId: JIM, rank: 5, value: 86, score: 89, played: 1, wins: 0, draws: 0, losses: 1, winPercent: 0, colorNumber: -1, regularByesUsed: 0, pairingByeUsed: false, selfArrangedUsed: 0 },
            { playerId: ROBBERT, rank: 6, value: 85, score: 85, played: 1, wins: 0, draws: 0, losses: 1, winPercent: 0, colorNumber: -1, regularByesUsed: 0, pairingByeUsed: false, selfArrangedUsed: 0 },
          ],
        },
        {
          roundNumber: 2,
          standings: [
            { playerId: WIEBE, rank: 1, value: 90, score: 264, played: 2, wins: 2, draws: 0, losses: 0, winPercent: 100, colorNumber: 0, regularByesUsed: 0, pairingByeUsed: false, selfArrangedUsed: 0 },
            { playerId: MAURICE, rank: 2, value: 89, score: 217.5, played: 2, wins: 1, draws: 1, losses: 0, winPercent: 75, colorNumber: 2, regularByesUsed: 0, pairingByeUsed: false, selfArrangedUsed: 0 },
            { playerId: SEBASTIAN, rank: 3, value: 88, score: 189, played: 1, wins: 0, draws: 1, losses: 0, winPercent: 50, colorNumber: -1, regularByesUsed: 0, pairingByeUsed: true, selfArrangedUsed: 0 },
            { playerId: JOPPE, rank: 4, value: 87, score: 176, played: 2, wins: 1, draws: 0, losses: 1, winPercent: 50, colorNumber: 2, regularByesUsed: 0, pairingByeUsed: false, selfArrangedUsed: 0 },
            { playerId: ROBBERT, rank: 5, value: 86, score: 85 + 85 / 3, played: 1, wins: 0, draws: 0, losses: 1, winPercent: 0, colorNumber: -1, regularByesUsed: 1, pairingByeUsed: false, selfArrangedUsed: 0 },
            { playerId: JIM, rank: 6, value: 85, score: 86, played: 2, wins: 0, draws: 0, losses: 2, winPercent: 0, colorNumber: -2, regularByesUsed: 0, pairingByeUsed: false, selfArrangedUsed: 0 },
          ],
        },
      ],
      current: result.byRound[1],
    });
  });
});
