import type { GameResult, PlayerHistory, PlayerHistoryEntry } from '../api/types.js';

export interface ValuePoint {
  /** 0 = starting value, before any round. */
  roundNumber: number;
  value: number;
  /** The entry that produced this point — absent for round 0 (the starting
   * point has no entry, just a value). */
  entry?: PlayerHistoryEntry;
}

/**
 * The running value after each round — round 0 is the starting value itself,
 * so the series always has entries.length + 1 points. Shared by the results
 * table's "Total" column and the value-over-time graph, so the two can never
 * disagree about what a player's value was after any given round.
 */
export function valueSeries(history: PlayerHistory): ValuePoint[] {
  const points: ValuePoint[] = [{ roundNumber: 0, value: history.startingValue }];
  let running = history.startingValue;
  for (const entry of history.entries) {
    running += entry.points;
    points.push({ roundNumber: entry.roundNumber, value: running, entry });
  }
  return points;
}

export interface RankPoint {
  /** 0 = starting rank, before any round. */
  roundNumber: number;
  rank: number;
  /** The size of the ranked field this rank was within, same round — not
   * assumed constant across the series (the field can grow or shrink). */
  ofCount: number;
  /** The entry played that round — absent for round 0, same as ValuePoint. */
  entry?: PlayerHistoryEntry;
}

/**
 * The player's own rank after each round — round 0 is startingRank, mirrors
 * valueSeries exactly except for what it plots. Unlike value, rank isn't
 * derived by running a delta forward; each round already carries its own
 * rank directly (ownRank/ownFieldSize), computed from that round's full
 * standings snapshot — see engine/standings.ts's playerGameHistory.
 */
export function rankSeries(history: PlayerHistory): RankPoint[] {
  const points: RankPoint[] = [];
  if (history.startingRank) {
    points.push({ roundNumber: 0, rank: history.startingRank.rank, ofCount: history.startingRank.ofCount });
  }
  for (const entry of history.entries) {
    if (entry.ownRank != null && entry.ownFieldSize != null) {
      points.push({ roundNumber: entry.roundNumber, rank: entry.ownRank, ofCount: entry.ownFieldSize, entry });
    }
  }
  return points;
}

/** Win/draw/loss from this player's own side of the board — the shared
 * white/black-perspective resultLabel in lib/format.ts isn't what you want
 * when you're looking at one player's personal history. */
export function outcomeFor(entry: PlayerHistoryEntry): 'W' | 'D' | 'L' | null {
  if (entry.kind === 'GAME' && entry.result) {
    if (entry.result === 'DRAW') return 'D';
    const whiteWon: GameResult[] = ['WHITE_WIN', 'WHITE_WIN_FORFEIT'];
    const playerWon = whiteWon.includes(entry.result) === (entry.color === 'WHITE');
    return playerWon ? 'W' : 'L';
  }
  if (entry.kind === 'EXTERNAL_BYE' && entry.externalOutcome) {
    return entry.externalOutcome === 'WIN' ? 'W' : entry.externalOutcome === 'LOSS' ? 'L' : 'D';
  }
  return null;
}

export function describeEntry(entry: PlayerHistoryEntry): string {
  switch (entry.kind) {
    case 'GAME':
      return entry.opponentName ? `vs ${entry.opponentName}` : 'vs —';
    case 'PAIRING_BYE':
      return 'Pairing bye';
    case 'REGULAR_BYE':
      return 'Regular bye (absent)';
    case 'EXTERNAL_BYE':
      return 'External result';
  }
}

export const OUTCOME_CLASS: Record<'W' | 'D' | 'L', string> = { W: 'win', D: 'draw', L: 'loss' };

interface ColorRecord {
  played: number;
  wins: number;
  draws: number;
  losses: number;
  /** (wins + 0.5*draws) / played * 100 — same formula as the season-wide
   * winPercent. 0 (never NaN) when played is 0. */
  winPercent: number;
}

export interface SnapshotStats {
  /** The single GAME win with the most points — in the Keizer system, points
   * gained on a win equals the opponent's value that round, so this is
   * exactly "beat the best-ranked opponent" too, no separate stat needed. */
  bestWin: PlayerHistoryEntry | null;
  /** The GAME loss to the opponent ranked worst (highest rank number) that
   * round. Every loss scores 0 regardless of opponent, so unlike bestWin
   * this can't be ranked by points — opponentRank is the only signal. */
  worstLoss: PlayerHistoryEntry | null;
  colorRecord: { WHITE: ColorRecord; BLACK: ColorRecord };
}

function emptyColorRecord(): ColorRecord {
  return { played: 0, wins: 0, draws: 0, losses: 0, winPercent: 0 };
}

/** Sample-size-independent snapshot stats for the player profile page — see
 * colorRecord's caveat below. Deliberately excludes streaks/rivalries: a
 * club running a few dozen games a season doesn't have enough volume for
 * those to mean anything. */
export function snapshotStats(history: PlayerHistory): SnapshotStats {
  let bestWin: PlayerHistoryEntry | null = null;
  let worstLoss: PlayerHistoryEntry | null = null;
  const byColor = { WHITE: emptyColorRecord(), BLACK: emptyColorRecord() };

  for (const entry of history.entries) {
    if (entry.kind !== 'GAME' || !entry.result) continue;
    const outcome = outcomeFor(entry);
    if (!outcome) continue;

    const record = byColor[entry.color!];
    record.played += 1;
    if (outcome === 'W') record.wins += 1;
    else if (outcome === 'D') record.draws += 1;
    else record.losses += 1;

    if (outcome === 'W' && (bestWin == null || entry.points > bestWin.points)) bestWin = entry;
    if (outcome === 'L' && entry.opponentRank != null && (worstLoss?.opponentRank ?? -Infinity) < entry.opponentRank) {
      worstLoss = entry;
    }
  }

  for (const record of Object.values(byColor)) {
    record.winPercent = record.played === 0 ? 0 : ((record.wins + 0.5 * record.draws) / record.played) * 100;
  }

  return { bestWin, worstLoss, colorRecord: byColor };
}
