import type { EntryKind, ExternalOutcome, GameResult, MembershipType, Round, RoundEntry } from '@prisma/client';
import { prisma } from '../../db/client.js';
import { REGULAR_BYE_CAP } from '../../engine/constants.js';
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

  // Rank candidates for pairing purposes: current standings value if they've
  // played before, else their raw enrollment startingValue for a debutant.
  // This temporary rank only orders *this round's* pairing — it's never persisted.
  const withValue = signedUpPlayerIds.map((playerId) => {
    const standing = standingsByPlayer.get(playerId);
    if (standing) return { playerId, value: standing.value, colorNumber: standing.colorNumber };
    return { playerId, value: enrollmentByPlayer.get(playerId)!.startingValue, colorNumber: 0 };
  });
  withValue.sort((a, b) => b.value - a.value);
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
    .filter((playerId) => (regularByeCounts[playerId] ?? 0) < REGULAR_BYE_CAP);

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
