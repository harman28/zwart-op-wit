import type { PairingCandidate } from './types.js';

/**
 * Whoever's color imbalance (|colorNumber|) is larger gets whichever color
 * corrects it. Ties (including 0 vs 0, e.g. round 1) go to the higher-ranked
 * player playing black — both rules taken directly from the club's rules doc.
 */
export function assignColors(
  a: PairingCandidate,
  b: PairingCandidate,
): { whitePlayerId: number; blackPlayerId: number } {
  const magA = Math.abs(a.colorNumber);
  const magB = Math.abs(b.colorNumber);

  if (magA === magB) {
    const higherRanked = a.rank < b.rank ? a : b;
    const other = higherRanked === a ? b : a;
    return { whitePlayerId: other.playerId, blackPlayerId: higherRanked.playerId };
  }

  const leader = magA > magB ? a : b;
  const other = leader === a ? b : a;
  // A negative colorNumber means they've played black more often, so they need white next.
  return leader.colorNumber < 0
    ? { whitePlayerId: leader.playerId, blackPlayerId: other.playerId }
    : { whitePlayerId: other.playerId, blackPlayerId: leader.playerId };
}
