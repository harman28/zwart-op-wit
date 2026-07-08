/**
 * The Keizer engine's public vocabulary. Nothing in this file (or anywhere in
 * `engine/`) may depend on Prisma, Fastify, or any I/O — see eslint.config.js.
 * `server/src/lib/mappers.ts` is the only place these types meet DB rows.
 */

export type GameOutcome =
  | 'WHITE_WIN'
  | 'BLACK_WIN'
  | 'DRAW'
  | 'WHITE_WIN_FORFEIT'
  | 'BLACK_WIN_FORFEIT';

export type ExternalOutcome = 'WIN' | 'DRAW' | 'LOSS';

export interface GameEntry {
  kind: 'GAME';
  whitePlayerId: number;
  blackPlayerId: number;
  /** null while the game hasn't been played/entered yet — contributes 0 to both sides. */
  result: GameOutcome | null;
  isSelfArranged: boolean;
}

export interface PairingByeEntry {
  kind: 'PAIRING_BYE';
  playerId: number;
}

export interface RegularByeEntry {
  kind: 'REGULAR_BYE';
  playerId: number;
}

export interface ExternalByeEntry {
  kind: 'EXTERNAL_BYE';
  playerId: number;
  /** null while the external result hasn't been entered yet — contributes 0, same convention as GameEntry.result. */
  outcome: ExternalOutcome | null;
}

export type RoundEntryInput = GameEntry | PairingByeEntry | RegularByeEntry | ExternalByeEntry;

export interface RoundInput {
  number: number;
  entries: RoundEntryInput[];
}

export interface PlayerBaseline {
  playerId: number;
  /** Admin-entered estimate, or seeded from a prior season's final rank. Used as-is, never re-normalized. */
  startingValue: number;
}

export interface SeasonReplayInput {
  /** Value assigned to rank 1; each subsequent rank is one less. */
  topValue: number;
  baselines: PlayerBaseline[];
  rounds: RoundInput[];
}

export interface PlayerStanding {
  playerId: number;
  rank: number;
  /** This round's ending value = next round's entering value. */
  value: number;
  score: number;
  /** Completed GAME entries only (byes excluded, forfeits/self-arranged included). */
  played: number;
  wins: number;
  draws: number;
  losses: number;
  /** (wins + 0.5*draws) / played * 100. 0 (never NaN) when played is 0. */
  winPercent: number;
  /** whiteCount - blackCount, season to date. */
  colorNumber: number;
  regularByesUsed: number;
  pairingByeUsed: boolean;
  selfArrangedUsed: number;
}

export interface RoundStandingsSnapshot {
  roundNumber: number;
  /** Sorted rank ascending. */
  standings: PlayerStanding[];
}

export interface SeasonReplayResult {
  byRound: RoundStandingsSnapshot[];
  current: RoundStandingsSnapshot;
}

export interface PairingCandidate {
  playerId: number;
  rank: number;
  colorNumber: number;
}

export interface PastPairing {
  playerAId: number;
  playerBId: number;
  roundNumber: number;
}

export interface GeneratePairingsInput {
  /** The round number these pairings are being generated for. */
  currentRoundNumber: number;
  /** A pairing at round K is forbidden while currentRoundNumber - K <= repeatPairingWindow. */
  repeatPairingWindow: number;
  signedUpPlayerIds: number[];
  /** Must contain a candidate for every id in signedUpPlayerIds, including brand-new players. */
  standings: PairingCandidate[];
  /** Full history — the engine does the window filtering itself, so window is a real, testable parameter. */
  pastPairings: PastPairing[];
  priorPairingByeCounts: Record<number, number>;
}

export type GeneratedPairing =
  | { kind: 'GAME'; whitePlayerId: number; blackPlayerId: number; tableNumber: number }
  | { kind: 'PAIRING_BYE'; playerId: number };

export interface GeneratePairingsResult {
  pairings: GeneratedPairing[];
  /** Never thrown instead of these — the engine always returns a full pairing set, even in edge cases. */
  warnings: string[];
}
