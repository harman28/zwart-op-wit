import { describe, expect, it } from 'vitest';
import { assignColors } from '../color.js';
import type { PairingCandidate } from '../types.js';

describe('assignColors', () => {
  it('32. colorNumber -3 vs 0 -> the -3 player gets white', () => {
    const a: PairingCandidate = { playerId: 1, rank: 1, colorNumber: -3 };
    const b: PairingCandidate = { playerId: 2, rank: 2, colorNumber: 0 };
    expect(assignColors(a, b)).toEqual({ whitePlayerId: 1, blackPlayerId: 2 });
  });

  it('33. +2 vs -2 (symmetric tie by magnitude) -> higher-ranked plays black, either argument order', () => {
    const higher: PairingCandidate = { playerId: 1, rank: 1, colorNumber: 2 };
    const lower: PairingCandidate = { playerId: 2, rank: 2, colorNumber: -2 };
    expect(assignColors(higher, lower)).toEqual({ whitePlayerId: 2, blackPlayerId: 1 });

    const higherB: PairingCandidate = { playerId: 1, rank: 1, colorNumber: -2 };
    const lowerB: PairingCandidate = { playerId: 2, rank: 2, colorNumber: 2 };
    expect(assignColors(higherB, lowerB)).toEqual({ whitePlayerId: 2, blackPlayerId: 1 });
  });

  it('34. both colorNumber 0 (round 1) -> tie-break by rank alone, higher-ranked plays black', () => {
    const a: PairingCandidate = { playerId: 1, rank: 1, colorNumber: 0 };
    const b: PairingCandidate = { playerId: 2, rank: 2, colorNumber: 0 };
    expect(assignColors(a, b)).toEqual({ whitePlayerId: 2, blackPlayerId: 1 });
  });

  it('35. assignColors is order-independent: assignColors(a,b) and assignColors(b,a) give the same real assignment', () => {
    const a: PairingCandidate = { playerId: 1, rank: 1, colorNumber: -4 };
    const b: PairingCandidate = { playerId: 2, rank: 2, colorNumber: 1 };
    expect(assignColors(a, b)).toEqual(assignColors(b, a));
  });

  it('36. -5 vs +1: color-magnitude correction wins over rank even against the higher-ranked player', () => {
    const higherRankedButBalanced: PairingCandidate = { playerId: 1, rank: 1, colorNumber: 1 };
    const lowerRankedButImbalanced: PairingCandidate = { playerId: 2, rank: 2, colorNumber: -5 };
    // If rank wrongly won here, player 1 (higher rank) would get black. Magnitude must win instead:
    // player 2 has the larger imbalance (-5, needs white).
    expect(assignColors(higherRankedButBalanced, lowerRankedButImbalanced)).toEqual({
      whitePlayerId: 2,
      blackPlayerId: 1,
    });
  });
});
