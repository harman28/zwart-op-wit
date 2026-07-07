import { assignColors } from './color.js';
import { PAIRING_BYE_CAP } from './constants.js';
import type {
  GeneratedPairing,
  GeneratePairingsInput,
  GeneratePairingsResult,
  PairingCandidate,
} from './types.js';

function pairKey(a: number, b: number): string {
  return a < b ? `${a}-${b}` : `${b}-${a}`;
}

/**
 * Rank-sort, pair 1v2/3v4/…, skip a rematch within the repeat-pairing window
 * (a pairing at round K is forbidden while currentRoundNumber - K <= window —
 * "cannot be paired again for the next N rounds", per the rules doc), and
 * give the odd-one-out pairing bye to the lowest-ranked signed-up player
 * still under their cap. Never throws for scheduling reasons — worst case,
 * it pairs anyway and says why in `warnings`, per the failure-proof requirement.
 */
export function generatePairings(input: GeneratePairingsInput): GeneratePairingsResult {
  const { currentRoundNumber, repeatPairingWindow, signedUpPlayerIds, standings, pastPairings, priorPairingByeCounts } =
    input;
  const warnings: string[] = [];

  const byId = new Map(standings.map((s) => [s.playerId, s]));
  const pool: PairingCandidate[] = signedUpPlayerIds
    .map((id) => {
      const candidate = byId.get(id);
      if (!candidate) throw new Error(`No standing supplied for signed-up player ${id}`);
      return candidate;
    })
    .sort((a, b) => a.rank - b.rank);

  const recentSet = new Set(
    pastPairings
      .filter((p) => currentRoundNumber - p.roundNumber <= repeatPairingWindow)
      .map((p) => pairKey(p.playerAId, p.playerBId)),
  );

  const pairings: GeneratedPairing[] = [];

  if (pool.length % 2 === 1) {
    let idx = pool.length - 1;
    while (idx >= 0 && (priorPairingByeCounts[pool[idx]!.playerId] ?? 0) >= PAIRING_BYE_CAP) idx--;
    if (idx < 0) {
      idx = pool.length - 1;
      warnings.push(
        `Every signed-up player has already used this season's pairing bye — giving it again to player ${pool[idx]!.playerId}.`,
      );
    }
    const [byePlayer] = pool.splice(idx, 1);
    pairings.push({ kind: 'PAIRING_BYE', playerId: byePlayer!.playerId });
  }

  while (pool.length > 0) {
    const a = pool.shift()!;
    let matchIdx = pool.findIndex((b) => !recentSet.has(pairKey(a.playerId, b.playerId)));
    if (matchIdx === -1) {
      matchIdx = 0;
      warnings.push(
        `Every remaining opponent for player ${a.playerId} has faced them within the repeat window — pairing anyway.`,
      );
    }
    const [opponent] = pool.splice(matchIdx, 1);
    const colors = assignColors(a, opponent!);
    pairings.push({ kind: 'GAME', whitePlayerId: colors.whitePlayerId, blackPlayerId: colors.blackPlayerId, tableNumber: 0 });
  }

  let table = 1;
  for (const pairing of pairings) {
    if (pairing.kind === 'GAME') pairing.tableNumber = table++;
  }

  return { pairings, warnings };
}
