import type { RoundEntry as PrismaRoundEntry, Round as PrismaRound } from '@prisma/client';
import type { PlayerBaseline, RoundEntryInput, RoundInput } from '../engine/types.js';

/**
 * The only place Prisma rows and engine types meet. Prisma's generated enums
 * for EntryKind/GameResult/ExternalOutcome already share the engine's exact
 * string literals by design — this is a structural reshape (flat nullable
 * columns -> a discriminated union), not a value transformation.
 */
export function mapEntryToEngine(entry: PrismaRoundEntry): RoundEntryInput {
  switch (entry.kind) {
    case 'GAME': {
      if (entry.whitePlayerId == null || entry.blackPlayerId == null) {
        throw new Error(`GAME entry ${entry.id} is missing a white/black player`);
      }
      return {
        kind: 'GAME',
        whitePlayerId: entry.whitePlayerId,
        blackPlayerId: entry.blackPlayerId,
        result: entry.result,
        isSelfArranged: entry.isSelfArranged,
      };
    }
    case 'PAIRING_BYE':
    case 'REGULAR_BYE': {
      if (entry.soloPlayerId == null) {
        throw new Error(`${entry.kind} entry ${entry.id} is missing soloPlayerId`);
      }
      return { kind: entry.kind, playerId: entry.soloPlayerId };
    }
    case 'EXTERNAL_BYE': {
      if (entry.soloPlayerId == null) {
        throw new Error(`EXTERNAL_BYE entry ${entry.id} is missing soloPlayerId`);
      }
      // externalOutcome is null while the result hasn't been entered yet — a legitimate
      // in-between state (player is marked as playing externally before it's known).
      return { kind: 'EXTERNAL_BYE', playerId: entry.soloPlayerId, outcome: entry.externalOutcome };
    }
  }
}

export function mapRoundToEngine(round: PrismaRound & { entries: PrismaRoundEntry[] }): RoundInput {
  return { number: round.number, entries: round.entries.map(mapEntryToEngine) };
}

export function mapEnrollmentsToBaselines(
  enrollments: { playerId: number; startingValue: number }[],
): PlayerBaseline[] {
  return enrollments.map((e) => ({ playerId: e.playerId, startingValue: e.startingValue }));
}
