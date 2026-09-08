import {
  EXTERNAL_BYE_FRACTION,
  PAIRING_BYE_FRACTION,
  REGULAR_BYE_FRACTION,
} from './constants.js';
import type {
  PlayerGameHistory,
  PlayerHistoryEntry,
  PlayerStanding,
  RoundEntryInput,
  RoundStandingsSnapshot,
  SeasonReplayInput,
  SeasonReplayResult,
} from './types.js';

/** One historical entry plus which round it belongs to — `historyEntries` needs
 * the round number attached so a per-player ledger entry can report it. */
interface DatedEntry {
  roundNumber: number;
  entry: RoundEntryInput;
}

/** A single (playerId, entry) contribution, captured while replaying the
 * round whose valueOf/historyEntries produced it. Rebuilt fresh every round,
 * so after the full replay it holds only the LAST round's ledger — i.e. every
 * historical entry's contribution as rebased under the season's final values,
 * matching `current`'s scores exactly. */
interface LedgerRow {
  playerId: number;
  roundNumber: number;
  entry: RoundEntryInput;
  points: number;
}

interface Counters {
  played: number;
  wins: number;
  draws: number;
  losses: number;
  colorNumber: number;
  regularByesUsed: number;
  pairingByeUsed: boolean;
  selfArrangedUsed: number;
}

function freshCounters(): Counters {
  return {
    played: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    colorNumber: 0,
    regularByesUsed: 0,
    pairingByeUsed: false,
    selfArrangedUsed: 0,
  };
}

function playerIdsIn(entry: RoundEntryInput): number[] {
  switch (entry.kind) {
    case 'GAME':
      return [entry.whitePlayerId, entry.blackPlayerId];
    case 'PAIRING_BYE':
    case 'REGULAR_BYE':
    case 'EXTERNAL_BYE':
      return [entry.playerId];
  }
}

/** Updates the running (non-value-dependent) per-player counters for one round's entries. */
function applyCounters(entry: RoundEntryInput, counters: Map<number, Counters>): void {
  switch (entry.kind) {
    case 'GAME': {
      const white = counters.get(entry.whitePlayerId)!;
      const black = counters.get(entry.blackPlayerId)!;
      white.colorNumber += 1;
      black.colorNumber -= 1;
      if (entry.isSelfArranged) {
        white.selfArrangedUsed += 1;
        black.selfArrangedUsed += 1;
      }
      if (entry.result === null) return;
      white.played += 1;
      black.played += 1;
      switch (entry.result) {
        case 'WHITE_WIN':
        case 'WHITE_WIN_FORFEIT':
          white.wins += 1;
          black.losses += 1;
          break;
        case 'BLACK_WIN':
        case 'BLACK_WIN_FORFEIT':
          black.wins += 1;
          white.losses += 1;
          break;
        case 'DRAW':
          white.draws += 1;
          black.draws += 1;
          break;
      }
      return;
    }
    case 'PAIRING_BYE':
      counters.get(entry.playerId)!.pairingByeUsed = true;
      return;
    case 'REGULAR_BYE':
      counters.get(entry.playerId)!.regularByesUsed += 1;
      return;
    case 'EXTERNAL_BYE': {
      if (entry.outcome === null) return;
      const c = counters.get(entry.playerId)!;
      c.played += 1;
      switch (entry.outcome) {
        case 'WIN':
          c.wins += 1;
          break;
        case 'LOSS':
          c.losses += 1;
          break;
        case 'DRAW':
          c.draws += 1;
          break;
      }
      return;
    }
  }
}

/** Each entry's point contribution(s), using a single current-value lookup for every reference. */
function contributionsFor(
  entry: RoundEntryInput,
  valueOf: (playerId: number) => number,
): Array<[playerId: number, points: number]> {
  switch (entry.kind) {
    case 'GAME': {
      if (entry.result === null) {
        return [
          [entry.whitePlayerId, 0],
          [entry.blackPlayerId, 0],
        ];
      }
      const whiteValue = valueOf(entry.whitePlayerId);
      const blackValue = valueOf(entry.blackPlayerId);
      switch (entry.result) {
        case 'WHITE_WIN':
        case 'WHITE_WIN_FORFEIT':
          return [
            [entry.whitePlayerId, blackValue],
            [entry.blackPlayerId, 0],
          ];
        case 'BLACK_WIN':
        case 'BLACK_WIN_FORFEIT':
          return [
            [entry.whitePlayerId, 0],
            [entry.blackPlayerId, whiteValue],
          ];
        case 'DRAW':
          return [
            [entry.whitePlayerId, blackValue / 2],
            [entry.blackPlayerId, whiteValue / 2],
          ];
      }
      break;
    }
    case 'PAIRING_BYE':
      return [[entry.playerId, valueOf(entry.playerId) * PAIRING_BYE_FRACTION]];
    case 'REGULAR_BYE':
      return [[entry.playerId, valueOf(entry.playerId) * REGULAR_BYE_FRACTION]];
    case 'EXTERNAL_BYE':
      if (entry.outcome === null) return [[entry.playerId, 0]];
      return [[entry.playerId, valueOf(entry.playerId) * EXTERNAL_BYE_FRACTION[entry.outcome]]];
  }
  throw new Error('unreachable');
}

interface ReplayCore {
  byRound: RoundStandingsSnapshot[];
  current: RoundStandingsSnapshot;
  /** Every historical entry's per-player contribution, as rebased under the
   * FINAL round's values (see LedgerRow) — empty when there are no rounds. */
  ledger: LedgerRow[];
  /** Per player, the "own current-snapshot value" term from step 4 above, as
   * of the FINAL round replayed (raw baseline for anyone who never debuted).
   * This plus the sum of that player's `ledger` points equals their current
   * score exactly — it's the piece playerGameHistory needs to make that add up. */
  ownValues: Map<number, number>;
}

function runReplay(input: SeasonReplayInput): ReplayCore {
  const { topValue, baselines, rounds } = input;

  const baselineMap = new Map<number, number>();
  for (const b of baselines) {
    if (baselineMap.has(b.playerId)) {
      throw new Error(`Duplicate baseline for player ${b.playerId}`);
    }
    baselineMap.set(b.playerId, b.startingValue);
  }

  const sortedRounds = [...rounds].sort((a, b) => a.number - b.number);

  if (sortedRounds.length === 0) {
    const order = [...baselines].sort((a, b) => b.startingValue - a.startingValue);
    const standings: PlayerStanding[] = order.map((b, idx) => ({
      playerId: b.playerId,
      rank: idx + 1,
      value: b.startingValue,
      score: b.startingValue,
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      winPercent: 0,
      colorNumber: 0,
      regularByesUsed: 0,
      pairingByeUsed: false,
      selfArrangedUsed: 0,
    }));
    const snapshot: RoundStandingsSnapshot = { roundNumber: 0, standings };
    return { byRound: [], current: snapshot, ledger: [], ownValues: new Map(baselineMap) };
  }

  const enteringValue = new Map<number, number>();
  const counters = new Map<number, Counters>();
  /** Current known rank order (best first); doubles as the tie-break for the next stable sort. */
  let order: number[] = [];
  const historyEntries: DatedEntry[] = [];
  const byRound: RoundStandingsSnapshot[] = [];
  /** Rebuilt every round; only the last round's survives past the loop. */
  let ledger: LedgerRow[] = [];
  /** Same idea as `ledger`: rebuilt every round, only the last round's values matter. */
  let lastRoundOwnValues = new Map<number, number>();

  for (const round of sortedRounds) {
    // 1. Debuts: first appearance ever uses the raw baseline, never rank-normalized.
    for (const entry of round.entries) {
      for (const playerId of playerIdsIn(entry)) {
        if (!counters.has(playerId)) {
          const startingValue = baselineMap.get(playerId);
          if (startingValue === undefined) {
            throw new Error(
              `Player ${playerId} appears in round ${round.number} with no baseline and no prior debut`,
            );
          }
          enteringValue.set(playerId, startingValue);
          counters.set(playerId, freshCounters());
          order.push(playerId);
        }
      }
    }

    // 2. Non-value counters, from this round's entries only.
    for (const entry of round.entries) {
      applyCounters(entry, counters);
    }

    // 3. This round's entries join the full history used to recompute every score from scratch.
    for (const entry of round.entries) historyEntries.push({ roundNumber: round.number, entry });

    // 4. Score = own current-snapshot value + every historical contribution, all under the SAME
    //    current-snapshot (this is what makes past rounds rebase when a player's rank has since moved).
    const valueOf = (playerId: number) => enteringValue.get(playerId)!;
    const score = new Map<number, number>();
    const roundOwnValues = new Map<number, number>();
    for (const playerId of order) {
      score.set(playerId, valueOf(playerId));
      roundOwnValues.set(playerId, valueOf(playerId));
    }
    lastRoundOwnValues = roundOwnValues;
    const roundLedger: LedgerRow[] = [];
    for (const { roundNumber, entry } of historyEntries) {
      for (const [playerId, points] of contributionsFor(entry, valueOf)) {
        score.set(playerId, score.get(playerId)! + points);
        roundLedger.push({ playerId, roundNumber, entry, points });
      }
    }
    ledger = roundLedger;

    // 5. Stable sort by score desc — ties keep the player's rank from entering this round.
    order = [...order].sort((a, b) => score.get(b)! - score.get(a)!);

    const standings: PlayerStanding[] = order.map((playerId, idx) => {
      const rank = idx + 1;
      const value = topValue - rank + 1;
      const c = counters.get(playerId)!;
      const winPercent = c.played === 0 ? 0 : ((c.wins + 0.5 * c.draws) / c.played) * 100;
      enteringValue.set(playerId, value); // becomes the entering snapshot for the next round
      return {
        playerId,
        rank,
        value,
        score: score.get(playerId)!,
        played: c.played,
        wins: c.wins,
        draws: c.draws,
        losses: c.losses,
        winPercent,
        colorNumber: c.colorNumber,
        regularByesUsed: c.regularByesUsed,
        pairingByeUsed: c.pairingByeUsed,
        selfArrangedUsed: c.selfArrangedUsed,
      };
    });

    byRound.push({ roundNumber: round.number, standings });
  }

  // Anyone who never actually debuted (enrolled but never appeared in a round
  // entry) falls back to their raw baseline — same convention the zero-rounds
  // branch above uses for "current score with nothing played yet".
  const ownValues = new Map(baselineMap);
  for (const [playerId, value] of lastRoundOwnValues) ownValues.set(playerId, value);

  return { byRound, current: byRound[byRound.length - 1]!, ledger, ownValues };
}

export function replaySeason(input: SeasonReplayInput): SeasonReplayResult {
  const { byRound, current } = runReplay(input);
  return { byRound, current };
}

/**
 * One player's round-by-round history — who they played, what happened, and
 * how many points it's currently worth. Every `points` value (and
 * `startingValue`) is computed under the season's final rebase (see
 * LedgerRow), so `startingValue + sum(entries.points)` equals their current
 * score exactly.
 */
export function playerGameHistory(input: SeasonReplayInput, playerId: number): PlayerGameHistory {
  const { ledger, ownValues } = runReplay(input);
  const entries = ledger
    .filter((row) => row.playerId === playerId)
    .map((row): PlayerHistoryEntry => {
      const { entry } = row;
      if (entry.kind === 'GAME') {
        const isWhite = entry.whitePlayerId === playerId;
        return {
          roundNumber: row.roundNumber,
          kind: 'GAME',
          opponentId: isWhite ? entry.blackPlayerId : entry.whitePlayerId,
          color: isWhite ? 'WHITE' : 'BLACK',
          result: entry.result,
          externalOutcome: null,
          isSelfArranged: entry.isSelfArranged,
          points: row.points,
        };
      }
      return {
        roundNumber: row.roundNumber,
        kind: entry.kind,
        opponentId: null,
        color: null,
        result: null,
        externalOutcome: entry.kind === 'EXTERNAL_BYE' ? entry.outcome : null,
        isSelfArranged: false,
        points: row.points,
      };
    })
    .sort((a, b) => a.roundNumber - b.roundNumber);

  return { startingValue: ownValues.get(playerId) ?? 0, entries };
}
