import type { EntryKind, ExternalOutcome, GameResult, MembershipType, Round, RoundEntry } from '@prisma/client';
import { prisma } from '../../db/client.js';
import { assignColors } from '../../engine/color.js';
import { generatePairings } from '../../engine/pairing.js';
import { replaySeason } from '../../engine/standings.js';
import type { PairingCandidate, PastPairing } from '../../engine/types.js';
import { HttpError } from '../../lib/errors.js';
import { mapEnrollmentsToBaselines, mapRoundToEngine } from '../../lib/mappers.js';

type RoundWithEntries = Round & { entries: RoundEntry[] };

function extractPastPairings(rounds: RoundWithEntries[]): PastPairing[] {
  const result: PastPairing[] = [];
  for (const round of rounds) {
    for (const entry of round.entries) {
      if (entry.kind === 'GAME' && entry.whitePlayerId != null && entry.blackPlayerId != null) {
        result.push({ playerAId: entry.whitePlayerId, playerBId: entry.blackPlayerId, roundNumber: round.number });
      }
    }
  }
  return result;
}

function countByKind(rounds: RoundWithEntries[], kind: EntryKind): Record<number, number> {
  const counts: Record<number, number> = {};
  for (const round of rounds) {
    for (const entry of round.entries) {
      if (entry.kind === kind && entry.soloPlayerId != null) {
        counts[entry.soloPlayerId] = (counts[entry.soloPlayerId] ?? 0) + 1;
      }
    }
  }
  return counts;
}

/**
 * Ranks every enrolled player by current standings value (raw enrollment
 * startingValue for anyone who hasn't played yet) — the same temporary,
 * never-persisted ordering used both to feed the pairing algorithm at round
 * creation and to decide colors when an admin manually adds a matchup later.
 */
async function computeCurrentCandidates(seasonId: number): Promise<{
  candidatesByPlayer: Map<number, PairingCandidate>;
  allRounds: RoundWithEntries[];
}> {
  const season = await prisma.season.findUnique({ where: { id: seasonId }, include: { enrollments: true } });
  if (!season) throw new HttpError(404, `Season ${seasonId} not found`);

  // Admin operates on the full truth (published + draft rounds), unlike the
  // public leaderboard which only ever reflects published rounds.
  const allRounds = await prisma.round.findMany({
    where: { seasonId },
    include: { entries: true },
    orderBy: { number: 'asc' },
  });

  // Same rule as the live leaderboard: when external matches are switched off
  // for this season, they must not affect scoring at all, not just visibility.
  const roundsForReplay = season.countExternalMatches
    ? allRounds
    : allRounds.map((r) => ({ ...r, entries: r.entries.filter((e) => e.kind !== 'EXTERNAL_BYE') }));

  const replay = replaySeason({
    topValue: season.topValue,
    baselines: mapEnrollmentsToBaselines(season.enrollments),
    rounds: roundsForReplay.map(mapRoundToEngine),
  });
  const standingsByPlayer = new Map(replay.current.standings.map((s) => [s.playerId, s]));

  const withValue = season.enrollments.map((e) => {
    const standing = standingsByPlayer.get(e.playerId);
    if (standing) return { playerId: e.playerId, value: standing.value, colorNumber: standing.colorNumber };
    return { playerId: e.playerId, value: e.startingValue, colorNumber: 0 };
  });
  withValue.sort((a, b) => b.value - a.value);
  const candidatesByPlayer = new Map<number, PairingCandidate>(
    withValue.map((w, idx) => [w.playerId, { playerId: w.playerId, rank: idx + 1, colorNumber: w.colorNumber }]),
  );
  return { candidatesByPlayer, allRounds };
}

export interface CreateRoundInput {
  number: number;
  date: Date;
  signedUpPlayerIds: number[];
  newPlayers?: { name: string; membershipType?: MembershipType; startingValue: number }[];
}

export async function createRound(seasonId: number, input: CreateRoundInput) {
  const season = await prisma.season.findUnique({ where: { id: seasonId }, include: { enrollments: true } });
  if (!season) throw new HttpError(404, `Season ${seasonId} not found`);
  if (season.endedAt) throw new HttpError(409, 'This season has ended');

  const existing = await prisma.round.findUnique({ where: { seasonId_number: { seasonId, number: input.number } } });
  if (existing) throw new HttpError(409, `Round ${input.number} already exists for this season`);

  const signedUpPlayerIds = [...input.signedUpPlayerIds];
  const enrollmentByPlayer = new Map(season.enrollments.map((e) => [e.playerId, e]));

  // "Add an unregistered player" — creates the club-wide identity and this
  // season's enrollment in the same step, then folds them into signups.
  // Defaults to GUEST (not FULL) — an admin who hasn't classified them yet
  // shouldn't have them silently counted as a full member; the players page's
  // "rounds played this season" hint on guests is what surfaces "they should
  // probably be upgraded now" once they've turned up a few times.
  for (const np of input.newPlayers ?? []) {
    const player = await prisma.player.create({ data: { name: np.name, membershipType: np.membershipType ?? 'GUEST' } });
    const enrollment = await prisma.seasonEnrollment.create({
      data: { seasonId, playerId: player.id, startingValue: np.startingValue },
    });
    enrollmentByPlayer.set(player.id, enrollment);
    signedUpPlayerIds.push(player.id);
  }

  for (const playerId of signedUpPlayerIds) {
    if (!enrollmentByPlayer.has(playerId)) {
      throw new HttpError(400, `Player ${playerId} is not enrolled in season ${seasonId}`);
    }
  }

  const { candidatesByPlayer, allRounds } = await computeCurrentCandidates(seasonId);
  // Newly-added-this-request players (the "add an unregistered player" case
  // above) have an enrollment but never went through the replay, so they're
  // absent from candidatesByPlayer — fall back to their raw startingValue,
  // ranked last, same as computeCurrentCandidates would for any debutant.
  const withValue = signedUpPlayerIds.map((playerId) => {
    const candidate = candidatesByPlayer.get(playerId);
    if (candidate) return candidate;
    return { playerId, rank: Number.MAX_SAFE_INTEGER, colorNumber: 0 };
  });
  withValue.sort((a, b) => a.rank - b.rank);
  const candidates: PairingCandidate[] = withValue.map((w, idx) => ({
    playerId: w.playerId,
    rank: idx + 1,
    colorNumber: w.colorNumber,
  }));

  const generated = generatePairings({
    currentRoundNumber: input.number,
    repeatPairingWindow: season.repeatPairingWindow,
    signedUpPlayerIds,
    standings: candidates,
    pastPairings: extractPastPairings(allRounds),
    priorPairingByeCounts: countByKind(allRounds, 'PAIRING_BYE'),
  });

  // Auto-materialize a REGULAR_BYE for every enrolled-but-absent player still under their cap.
  const regularByeCounts = countByKind(allRounds, 'REGULAR_BYE');
  const absentUnderCap = [...enrollmentByPlayer.keys()]
    .filter((playerId) => !signedUpPlayerIds.includes(playerId))
    .filter((playerId) => (regularByeCounts[playerId] ?? 0) < season.regularByeCap);

  return prisma.round.create({
    data: {
      seasonId,
      number: input.number,
      date: input.date,
      signups: { create: signedUpPlayerIds.map((playerId) => ({ playerId })) },
      entries: {
        create: [
          ...generated.pairings.map((p) =>
            p.kind === 'GAME'
              ? {
                  kind: 'GAME' as const,
                  whitePlayerId: p.whitePlayerId,
                  blackPlayerId: p.blackPlayerId,
                  tableNumber: p.tableNumber,
                }
              : { kind: 'PAIRING_BYE' as const, soloPlayerId: p.playerId },
          ),
          ...absentUnderCap.map((playerId) => ({ kind: 'REGULAR_BYE' as const, soloPlayerId: playerId })),
        ],
      },
    },
    include: { entries: true, signups: true },
  });
}

/** Full entry list including REGULAR_BYE — the raw-correction view, admin only. */
export async function getRoundAdmin(id: number) {
  const round = await prisma.round.findUnique({
    where: { id },
    include: {
      entries: { include: { whitePlayer: true, blackPlayer: true, soloPlayer: true } },
      signups: { include: { player: true } },
    },
  });
  if (!round) throw new HttpError(404, `Round ${id} not found`);
  return round;
}

export async function updateRound(id: number, data: { number?: number; date?: Date }) {
  return prisma.round.update({ where: { id }, data });
}

export interface UpdateEntryInput {
  kind?: EntryKind;
  whitePlayerId?: number | null;
  blackPlayerId?: number | null;
  soloPlayerId?: number | null;
  result?: GameResult | null;
  externalOutcome?: ExternalOutcome | null;
  isSelfArranged?: boolean;
  tableNumber?: number | null;
}

/**
 * The one flexible editor covering every override: swap a player, change
 * kind (turn a PAIRING_BYE into a GAME = "assign opponent"), set a result,
 * change table number. Works identically whether the round is a draft or
 * was published weeks ago — nothing here checks isPublished — which is the
 * actual mechanism behind "no hard-blocking sequencing".
 */
export async function updateEntry(id: number, data: UpdateEntryInput) {
  return prisma.roundEntry.update({ where: { id }, data });
}

export async function addEntry(
  roundId: number,
  data: {
    kind: EntryKind;
    whitePlayerId?: number;
    blackPlayerId?: number;
    soloPlayerId?: number;
    result?: GameResult;
    externalOutcome?: ExternalOutcome;
    isSelfArranged?: boolean;
    tableNumber?: number;
  },
) {
  return prisma.roundEntry.create({ data: { roundId, ...data } });
}

/** Shared by addMatchup and assignOpponent: who plays which color is never an
 * admin choice (computed via assignColors, same as pairing generation), and a
 * newly-created table always gets the next free number in the round. */
async function computeColorsAndNextTable(roundId: number, seasonId: number, playerAId: number, playerBId: number) {
  const { candidatesByPlayer } = await computeCurrentCandidates(seasonId);
  const a = candidatesByPlayer.get(playerAId);
  const b = candidatesByPlayer.get(playerBId);
  if (!a || !b) throw new HttpError(400, 'Both players must be enrolled in this season');

  const colors = assignColors(a, b);
  const existingGames = await prisma.roundEntry.findMany({ where: { roundId, kind: 'GAME' } });
  const nextTable = Math.max(0, ...existingGames.map((g) => g.tableNumber ?? 0)) + 1;
  return { colors, nextTable };
}

/**
 * Adds a brand-new matchup to an existing round from just two players — who
 * plays which color is never an admin choice, so this computes it the same
 * way pairing generation does (`assignColors`, off each player's current
 * color balance and standing) rather than accepting whitePlayerId/blackPlayerId.
 */
export async function addMatchup(roundId: number, playerAId: number, playerBId: number) {
  const round = await prisma.round.findUnique({ where: { id: roundId } });
  if (!round) throw new HttpError(404, `Round ${roundId} not found`);

  const { colors, nextTable } = await computeColorsAndNextTable(roundId, round.seasonId, playerAId, playerBId);

  return prisma.roundEntry.create({
    data: {
      roundId,
      kind: 'GAME',
      whitePlayerId: colors.whitePlayerId,
      blackPlayerId: colors.blackPlayerId,
      tableNumber: nextTable,
    },
  });
}

export interface AssignOpponentInput {
  opponentId?: number;
  /** Same "add an unregistered player" shape createRound offers — creates the
   * club-wide identity and this season's enrollment in one step. */
  newOpponent?: { name: string; membershipType?: MembershipType; startingValue: number };
}

/**
 * Turns a PAIRING_BYE into a GAME by giving the unpaired player an opponent —
 * same color/table computation as addMatchup, rather than always hardcoding
 * the previously-unpaired player as White and leaving tableNumber unset. The
 * opponent can be an existing enrolled player or a brand-new unregistered one.
 */
export async function assignOpponent(pairingByeEntryId: number, input: AssignOpponentInput) {
  const entry = await prisma.roundEntry.findUnique({ where: { id: pairingByeEntryId } });
  if (!entry) throw new HttpError(404, `Entry ${pairingByeEntryId} not found`);
  if (entry.kind !== 'PAIRING_BYE' || entry.soloPlayerId == null) {
    throw new HttpError(400, `Entry ${pairingByeEntryId} is not a pairing bye`);
  }
  const round = await prisma.round.findUnique({ where: { id: entry.roundId } });
  if (!round) throw new HttpError(404, `Round ${entry.roundId} not found`);

  let opponentId = input.opponentId;
  if (opponentId == null) {
    if (!input.newOpponent) throw new HttpError(400, 'Either opponentId or newOpponent is required');
    const player = await prisma.player.create({
      data: { name: input.newOpponent.name, membershipType: input.newOpponent.membershipType ?? 'GUEST' },
    });
    await prisma.seasonEnrollment.create({
      data: { seasonId: round.seasonId, playerId: player.id, startingValue: input.newOpponent.startingValue },
    });
    opponentId = player.id;
  }

  const { colors, nextTable } = await computeColorsAndNextTable(entry.roundId, round.seasonId, entry.soloPlayerId, opponentId);

  return prisma.roundEntry.update({
    where: { id: pairingByeEntryId },
    data: {
      kind: 'GAME',
      soloPlayerId: null,
      whitePlayerId: colors.whitePlayerId,
      blackPlayerId: colors.blackPlayerId,
      tableNumber: nextTable,
    },
  });
}

export async function deleteEntry(id: number) {
  await prisma.roundEntry.delete({ where: { id } });
}

/** Bulk renumber/cascade: the "override the first table, rest follow" stepper behavior. */
export async function renumberTables(roundId: number, startAt: number) {
  const games = await prisma.roundEntry.findMany({
    where: { roundId, kind: 'GAME' },
    orderBy: { tableNumber: 'asc' },
  });
  await prisma.$transaction(
    games.map((g, idx) => prisma.roundEntry.update({ where: { id: g.id }, data: { tableNumber: startAt + idx } })),
  );
  return prisma.roundEntry.findMany({ where: { roundId, kind: 'GAME' }, orderBy: { tableNumber: 'asc' } });
}

/** Idempotent — only ever controls public visibility, nothing else. */
export async function publishRound(id: number) {
  return prisma.round.update({ where: { id }, data: { isPublished: true } });
}

export async function deleteRound(id: number) {
  await prisma.round.delete({ where: { id } });
}
