import { describe, expect, it } from 'vitest';
import { replaySeason } from '../standings.js';
import type { PlayerStanding, RoundEntryInput, RoundInput } from '../types.js';

function standingOf(standings: PlayerStanding[], playerId: number): PlayerStanding {
  const row = standings.find((s) => s.playerId === playerId);
  if (!row) throw new Error(`player ${playerId} not found`);
  return row;
}

describe('replaySeason — general correctness', () => {
  it('10. zero rounds played: raw baseline order, score = startingValue, played = 0', () => {
    const result = replaySeason({
      topValue: 100,
      baselines: [
        { playerId: 1, startingValue: 100 },
        { playerId: 2, startingValue: 90 },
        { playerId: 3, startingValue: 80 },
      ],
      rounds: [],
    });

    expect(result.byRound).toEqual([]);
    expect(result.current.roundNumber).toBe(0);
    expect(result.current.standings.map((s) => s.playerId)).toEqual([1, 2, 3]);
    for (const s of result.current.standings) {
      expect(s.score).toBe(s.value);
      expect(s.played).toBe(0);
    }
    expect(standingOf(result.current.standings, 1).score).toBe(100);
    expect(standingOf(result.current.standings, 2).score).toBe(90);
    expect(standingOf(result.current.standings, 3).score).toBe(80);
  });

  it('11. an unbroken win streak monotonically holds rank 1 across 3 rounds', () => {
    const rounds: RoundInput[] = [
      {
        number: 1,
        entries: [
          { kind: 'GAME', whitePlayerId: 1, blackPlayerId: 2, result: 'WHITE_WIN', isSelfArranged: false },
          { kind: 'GAME', whitePlayerId: 3, blackPlayerId: 4, result: 'WHITE_WIN', isSelfArranged: false },
        ],
      },
      {
        number: 2,
        entries: [
          { kind: 'GAME', whitePlayerId: 1, blackPlayerId: 3, result: 'WHITE_WIN', isSelfArranged: false },
          { kind: 'GAME', whitePlayerId: 2, blackPlayerId: 4, result: 'WHITE_WIN', isSelfArranged: false },
        ],
      },
      {
        number: 3,
        entries: [
          { kind: 'GAME', whitePlayerId: 1, blackPlayerId: 2, result: 'WHITE_WIN', isSelfArranged: false },
          { kind: 'GAME', whitePlayerId: 3, blackPlayerId: 4, result: 'BLACK_WIN', isSelfArranged: false },
        ],
      },
    ];
    const result = replaySeason({
      topValue: 100,
      baselines: [1, 2, 3, 4].map((playerId) => ({ playerId, startingValue: 100 - playerId })),
      rounds,
    });
    for (const snapshot of result.byRound) {
      expect(standingOf(snapshot.standings, 1).rank).toBe(1);
    }
  });

  it('12. a GAME entry with result:null contributes 0 to both players', () => {
    const result = replaySeason({
      topValue: 100,
      baselines: [
        { playerId: 1, startingValue: 100 },
        { playerId: 2, startingValue: 90 },
      ],
      rounds: [{ number: 1, entries: [{ kind: 'GAME', whitePlayerId: 1, blackPlayerId: 2, result: null, isSelfArranged: false }] }],
    });
    const round1 = result.byRound[0]!;
    expect(standingOf(round1.standings, 1).score).toBe(100);
    expect(standingOf(round1.standings, 2).score).toBe(90);
    expect(standingOf(round1.standings, 1).played).toBe(0);
    expect(standingOf(round1.standings, 2).played).toBe(0);
  });

  it('13. filling in a result between two replaySeason calls changes only the expected delta', () => {
    const baselines = [
      { playerId: 1, startingValue: 100 },
      { playerId: 2, startingValue: 90 },
    ];
    const before = replaySeason({
      topValue: 100,
      baselines,
      rounds: [{ number: 1, entries: [{ kind: 'GAME', whitePlayerId: 1, blackPlayerId: 2, result: null, isSelfArranged: false }] }],
    });
    const after = replaySeason({
      topValue: 100,
      baselines,
      rounds: [{ number: 1, entries: [{ kind: 'GAME', whitePlayerId: 1, blackPlayerId: 2, result: 'WHITE_WIN', isSelfArranged: false }] }],
    });
    const beforeScore1 = standingOf(before.byRound[0]!.standings, 1).score;
    const afterScore1 = standingOf(after.byRound[0]!.standings, 1).score;
    const beforeScore2 = standingOf(before.byRound[0]!.standings, 2).score;
    const afterScore2 = standingOf(after.byRound[0]!.standings, 2).score;
    expect(afterScore1 - beforeScore1).toBe(90); // winner gains loser's value
    expect(afterScore2 - beforeScore2).toBe(0); // loser still contributes 0
  });

  it('14. a player debuting at round 3 is absent from rounds 1-2 and enters at their raw startingValue', () => {
    const rounds: RoundInput[] = [
      { number: 1, entries: [{ kind: 'GAME', whitePlayerId: 1, blackPlayerId: 2, result: 'WHITE_WIN', isSelfArranged: false }] },
      { number: 2, entries: [{ kind: 'GAME', whitePlayerId: 1, blackPlayerId: 2, result: 'WHITE_WIN', isSelfArranged: false }] },
      { number: 3, entries: [{ kind: 'GAME', whitePlayerId: 1, blackPlayerId: 3, result: 'BLACK_WIN', isSelfArranged: false }] },
    ];
    const result = replaySeason({
      topValue: 100,
      baselines: [
        { playerId: 1, startingValue: 100 },
        { playerId: 2, startingValue: 90 },
        { playerId: 3, startingValue: 50 },
      ],
      rounds,
    });
    expect(result.byRound[0]!.standings.find((s) => s.playerId === 3)).toBeUndefined();
    expect(result.byRound[1]!.standings.find((s) => s.playerId === 3)).toBeUndefined();
    const round3Player3 = standingOf(result.byRound[2]!.standings, 3);
    // own raw baseline (50) + win vs player 1 (player 1's round-3 entering value)
    const player1EnteringRound3 = 100; // player 1 is rank 1 entering every round in this fixture
    expect(round3Player3.score).toBe(50 + player1EnteringRound3);
  });

  it('15. exact-score ties preserve the existing order (debut order in round 1, carried-forward rank thereafter)', () => {
    const result = replaySeason({
      topValue: 100,
      baselines: [
        { playerId: 1, startingValue: 100 },
        { playerId: 2, startingValue: 100 },
      ],
      rounds: [{ number: 1, entries: [{ kind: 'GAME', whitePlayerId: 1, blackPlayerId: 2, result: 'DRAW', isSelfArranged: false }] }],
    });
    const round1 = result.byRound[0]!;
    expect(standingOf(round1.standings, 1).score).toBe(standingOf(round1.standings, 2).score);
    expect(standingOf(round1.standings, 1).rank).toBe(1);
    expect(standingOf(round1.standings, 2).rank).toBe(2);
  });

  it('16. played excludes all bye kinds; includes self-arranged and forfeit games', () => {
    const result = replaySeason({
      topValue: 100,
      baselines: [
        { playerId: 1, startingValue: 100 },
        { playerId: 2, startingValue: 90 },
        { playerId: 3, startingValue: 80 },
        { playerId: 4, startingValue: 70 },
      ],
      rounds: [
        {
          number: 1,
          entries: [
            { kind: 'GAME', whitePlayerId: 1, blackPlayerId: 2, result: 'WHITE_WIN_FORFEIT', isSelfArranged: true },
            { kind: 'REGULAR_BYE', playerId: 3 },
            { kind: 'PAIRING_BYE', playerId: 4 },
          ],
        },
      ],
    });
    const round1 = result.byRound[0]!;
    expect(standingOf(round1.standings, 1).played).toBe(1);
    expect(standingOf(round1.standings, 2).played).toBe(1);
    expect(standingOf(round1.standings, 3).played).toBe(0);
    expect(standingOf(round1.standings, 4).played).toBe(0);
    expect(standingOf(round1.standings, 1).selfArrangedUsed).toBe(1);
    expect(standingOf(round1.standings, 2).selfArrangedUsed).toBe(1);
  });

  it('17. winPercent is 0, never NaN, when played is 0', () => {
    const result = replaySeason({
      topValue: 100,
      baselines: [{ playerId: 1, startingValue: 100 }],
      rounds: [{ number: 1, entries: [{ kind: 'REGULAR_BYE', playerId: 1 }] }],
    });
    const standing = standingOf(result.byRound[0]!.standings, 1);
    expect(standing.played).toBe(0);
    expect(standing.winPercent).toBe(0);
    expect(Number.isNaN(standing.winPercent)).toBe(false);
  });

  it('18. a defensively-malformed 4th REGULAR_BYE is still scored faithfully — the engine never hides a caller-side cap bug', () => {
    const rounds: RoundInput[] = [1, 2, 3, 4].map((n) => ({
      number: n,
      entries: [{ kind: 'REGULAR_BYE', playerId: 1 } satisfies RoundEntryInput],
    }));
    const result = replaySeason({ topValue: 100, baselines: [{ playerId: 1, startingValue: 100 }], rounds });
    const last = standingOf(result.current.standings, 1);
    expect(last.regularByesUsed).toBe(4);
    // Lone player always stays rank 1 -> value is always topValue (100). Score = 100 (own) + 4 * (100/3).
    expect(last.score).toBeCloseTo(100 + 4 * (100 / 3), 5);
  });

  it('19. colorNumber accumulates (whiteCount - blackCount) across a multi-round sequence', () => {
    const result = replaySeason({
      topValue: 100,
      baselines: [
        { playerId: 1, startingValue: 100 },
        { playerId: 2, startingValue: 90 },
      ],
      rounds: [
        { number: 1, entries: [{ kind: 'GAME', whitePlayerId: 1, blackPlayerId: 2, result: 'DRAW', isSelfArranged: false }] },
        { number: 2, entries: [{ kind: 'GAME', whitePlayerId: 2, blackPlayerId: 1, result: 'DRAW', isSelfArranged: false }] },
        { number: 3, entries: [{ kind: 'GAME', whitePlayerId: 1, blackPlayerId: 2, result: 'DRAW', isSelfArranged: false }] },
      ],
    });
    const final = standingOf(result.current.standings, 1);
    const finalOther = standingOf(result.current.standings, 2);
    expect(final.colorNumber).toBe(1); // white, black, white => +1 -1 +1
    expect(finalOther.colorNumber).toBe(-1);
  });

  it('20. external-bye WIN/DRAW/LOSS contribute exactly 75%/50%/25% of own current value', () => {
    const result = replaySeason({
      topValue: 100,
      baselines: [
        { playerId: 1, startingValue: 100 },
        { playerId: 2, startingValue: 100 },
        { playerId: 3, startingValue: 100 },
      ],
      rounds: [
        {
          number: 1,
          entries: [
            { kind: 'EXTERNAL_BYE', playerId: 1, outcome: 'WIN' },
            { kind: 'EXTERNAL_BYE', playerId: 2, outcome: 'DRAW' },
            { kind: 'EXTERNAL_BYE', playerId: 3, outcome: 'LOSS' },
          ],
        },
      ],
    });
    const round1 = result.byRound[0]!;
    expect(standingOf(round1.standings, 1).score).toBe(175);
    expect(standingOf(round1.standings, 2).score).toBe(150);
    expect(standingOf(round1.standings, 3).score).toBe(125);
  });

  it("20b. an EXTERNAL_BYE with outcome: null (result not entered yet) contributes 0, like an unplayed GAME", () => {
    const result = replaySeason({
      topValue: 100,
      baselines: [{ playerId: 1, startingValue: 100 }],
      rounds: [{ number: 1, entries: [{ kind: 'EXTERNAL_BYE', playerId: 1, outcome: null }] }],
    });
    expect(standingOf(result.byRound[0]!.standings, 1).score).toBe(100);
  });

  it('21. a self-arranged GAME scores identically to a normal one; isSelfArranged only affects its own counter', () => {
    const baselines = [
      { playerId: 1, startingValue: 100 },
      { playerId: 2, startingValue: 90 },
    ];
    const normal = replaySeason({
      topValue: 100,
      baselines,
      rounds: [{ number: 1, entries: [{ kind: 'GAME', whitePlayerId: 1, blackPlayerId: 2, result: 'WHITE_WIN', isSelfArranged: false }] }],
    });
    const selfArranged = replaySeason({
      topValue: 100,
      baselines,
      rounds: [{ number: 1, entries: [{ kind: 'GAME', whitePlayerId: 1, blackPlayerId: 2, result: 'WHITE_WIN', isSelfArranged: true }] }],
    });
    expect(standingOf(selfArranged.byRound[0]!.standings, 1).score).toBe(standingOf(normal.byRound[0]!.standings, 1).score);
    expect(standingOf(normal.byRound[0]!.standings, 1).selfArrangedUsed).toBe(0);
    expect(standingOf(selfArranged.byRound[0]!.standings, 1).selfArrangedUsed).toBe(1);
  });

  it('42. throws a descriptive error if an entry references a playerId with no baseline and no prior debut', () => {
    expect(() =>
      replaySeason({
        topValue: 100,
        baselines: [{ playerId: 1, startingValue: 100 }],
        rounds: [{ number: 1, entries: [{ kind: 'GAME', whitePlayerId: 1, blackPlayerId: 2, result: 'WHITE_WIN', isSelfArranged: false }] }],
      }),
    ).toThrow(/no baseline/i);
  });

  it('43. throws a descriptive error on a duplicate playerId in baselines', () => {
    expect(() =>
      replaySeason({
        topValue: 100,
        baselines: [
          { playerId: 1, startingValue: 100 },
          { playerId: 1, startingValue: 90 },
        ],
        rounds: [],
      }),
    ).toThrow(/duplicate/i);
  });
});
