import {
  EXTERNAL_BYE_FRACTION,
  PAIRING_BYE_FRACTION,
  REGULAR_BYE_FRACTION,
} from './constants.js';
import type {
  PlayerStanding,
  RoundEntryInput,
  RoundStandingsSnapshot,
  SeasonReplayInput,
  SeasonReplayResult,
} from './types.js';

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
    case 'EXTERNAL_BYE':
      return;
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
      return [[entry.playerId, valueOf(entry.playerId) * EXTERNAL_BYE_FRACTION[entry.outcome]]];
  }
  throw new Error('unreachable');
}

export function replaySeason(input: SeasonReplayInput): SeasonReplayResult {
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
    return { byRound: [], current: snapshot };
  }

  const enteringValue = new Map<number, number>();
  const counters = new Map<number, Counters>();
  /** Current known rank order (best first); doubles as the tie-break for the next stable sort. */
  let order: number[] = [];
  const historyEntries: RoundEntryInput[] = [];
  const byRound: RoundStandingsSnapshot[] = [];

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
    historyEntries.push(...round.entries);

    // 4. Score = own current-snapshot value + every historical contribution, all under the SAME
    //    current-snapshot (this is what makes past rounds rebase when a player's rank has since moved).
    const valueOf = (playerId: number) => enteringValue.get(playerId)!;
    const score = new Map<number, number>();
    for (const playerId of order) score.set(playerId, valueOf(playerId));
    for (const entry of historyEntries) {
      for (const [playerId, points] of contributionsFor(entry, valueOf)) {
        score.set(playerId, score.get(playerId)! + points);
      }
    }

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

  return { byRound, current: byRound[byRound.length - 1]! };
}
