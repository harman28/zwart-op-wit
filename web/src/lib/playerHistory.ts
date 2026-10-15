import type { PlayerHistory } from '../api/types.js';

export interface ValuePoint {
  /** 0 = starting value, before any round. */
  roundNumber: number;
  value: number;
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
    points.push({ roundNumber: entry.roundNumber, value: running });
  }
  return points;
}
