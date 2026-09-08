export type MembershipType = 'FULL' | 'INTERNAL_ONLY' | 'GUEST';
export type EntryKind = 'GAME' | 'PAIRING_BYE' | 'REGULAR_BYE' | 'EXTERNAL_BYE';
export type GameResult = 'WHITE_WIN' | 'BLACK_WIN' | 'DRAW' | 'WHITE_WIN_FORFEIT' | 'BLACK_WIN_FORFEIT';
export type ExternalOutcome = 'WIN' | 'DRAW' | 'LOSS';
export type Gender = 'M' | 'V' | 'X';

export interface Player {
  id: number;
  name: string;
  membershipType: MembershipType;
  notes: string | null;
  gender: Gender | null;
  knsbId: string | null;
  federation: string | null;
  createdAt: string;
  archivedAt: string | null;
  roundsThisSeason?: number;
}

export interface Season {
  id: number;
  name: string;
  startedAt: string;
  endedAt: string | null;
  isArchived: boolean;
  topValue: number;
  repeatPairingWindow: number;
  countExternalMatches: boolean;
  regularByeCap: number;
  knsbTournamentName: string | null;
  knsbPlannedEndDate: string | null;
}

export interface Standing {
  playerId: number;
  name: string;
  membershipType: MembershipType;
  rank: number;
  value: number;
  score: number;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  winPercent: number;
  colorNumber: number;
  regularByesUsed: number;
  pairingByeUsed: boolean;
  selfArrangedUsed: number;
}

export interface Leaderboard {
  roundNumber: number;
  standings: Standing[];
  /** Published round numbers this season has, ascending — for a "view as of round X" picker. */
  availableRounds: number[];
}

export interface PlayerRef {
  id: number;
  name: string;
}

export interface RoundEntry {
  id: number;
  kind: EntryKind;
  tableNumber: number | null;
  whitePlayerId: number | null;
  whitePlayer: PlayerRef | null;
  blackPlayerId: number | null;
  blackPlayer: PlayerRef | null;
  soloPlayerId: number | null;
  soloPlayer: PlayerRef | null;
  result: GameResult | null;
  externalOutcome: ExternalOutcome | null;
  isSelfArranged: boolean;
}

export interface Round {
  id: number;
  seasonId: number;
  number: number;
  date: string;
  isPublished: boolean;
  entries: RoundEntry[];
}

export interface RoundSignup {
  id: number;
  playerId: number;
  player: PlayerRef;
}

export interface RoundAdmin extends Round {
  signups: RoundSignup[];
}

export interface ClubSettings {
  defaultTopValue: number;
  defaultRepeatPairingWindow: number;
  defaultCountExternalMatches: boolean;
  defaultRegularByeCap: number;
  defaultKnsbArbiterName: string | null;
  defaultKnsbArbiterEmail: string | null;
}
