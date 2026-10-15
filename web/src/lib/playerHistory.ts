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
