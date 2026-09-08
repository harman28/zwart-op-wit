import type { MembershipType } from '@prisma/client';
import { prisma } from '../../db/client.js';
import { replaySeason } from '../../engine/standings.js';
import { HttpError } from '../../lib/errors.js';
import { mapEnrollmentsToBaselines, mapRoundToEngine } from '../../lib/mappers.js';

export async function listSeasons() {
  return prisma.season.findMany({ orderBy: { startedAt: 'desc' } });
}

export async function getSeason(id: number) {
  const season = await prisma.season.findUnique({ where: { id } });
  if (!season) throw new HttpError(404, `Season ${id} not found`);
  return season;
}

export async function getCurrentSeason() {
  const season = await prisma.season.findFirst({ where: { endedAt: null }, orderBy: { startedAt: 'desc' } });
  if (!season) throw new HttpError(404, 'No active season');
  return season;
}

export interface RosterEntryInput {
  playerId?: number;
  newPlayerName?: string;
  membershipType?: MembershipType;
  startingValue: number;
}

export interface CreateSeasonInput {
  name: string;
  topValue?: number;
  repeatPairingWindow?: number;
  countExternalMatches?: boolean;
  regularByeCap?: number;
  knsbTournamentName?: string;
  knsbPlannedEndDate?: Date;
  roster: RosterEntryInput[];
}

export async function createSeason(input: CreateSeasonInput) {
  const active = await prisma.season.findFirst({ where: { endedAt: null } });
  if (active) throw new HttpError(409, 'A season is already active — end it before starting a new one');

  const clubSettings = await prisma.clubSettings.findUniqueOrThrow({ where: { id: 1 } });
  const topValue = input.topValue ?? clubSettings.defaultTopValue;
  const repeatPairingWindow = input.repeatPairingWindow ?? clubSettings.defaultRepeatPairingWindow;
  const countExternalMatches = input.countExternalMatches ?? clubSettings.defaultCountExternalMatches;
  const regularByeCap = input.regularByeCap ?? clubSettings.defaultRegularByeCap;

  return prisma.$transaction(
    async (tx) => {
      const season = await tx.season.create({
        data: {
          name: input.name,
          topValue,
          repeatPairingWindow,
          countExternalMatches,
          regularByeCap,
          knsbTournamentName: input.knsbTournamentName ?? input.name,
          knsbPlannedEndDate: input.knsbPlannedEndDate,
        },
      });
      // One create per genuinely new player (usually few or none), then a single
      // bulk insert for all enrollments — N sequential round trips here was
      // enough to blow the transaction timeout on a full-size roster.
      const enrollments: { seasonId: number; playerId: number; startingValue: number }[] = [];
      for (const entry of input.roster) {
        let playerId = entry.playerId;
        if (playerId == null) {
          if (!entry.newPlayerName) throw new HttpError(400, 'Each roster entry needs a playerId or a newPlayerName');
          const player = await tx.player.create({
            data: { name: entry.newPlayerName, membershipType: entry.membershipType ?? 'FULL' },
          });
          playerId = player.id;
        }
        enrollments.push({ seasonId: season.id, playerId, startingValue: entry.startingValue });
      }
      await tx.seasonEnrollment.createMany({ data: enrollments });
      return season;
    },
    { timeout: 15000 },
  );
}

/** The round number a newly created round should use — never admin-editable, just computed. */
/**
 * The next round number, plus whichever unpublished (draft) round already
 * occupies it, if any — round numbers are unique per season regardless of
 * publish state, so an abandoned draft silently bumps the "next" number
 * unless the admin is told it's there and given the chance to resume or
 * discard it.
 */
export async function getNextRoundNumber(seasonId: number) {
  const last = await prisma.round.findFirst({ where: { seasonId }, orderBy: { number: 'desc' } });
  const number = (last?.number ?? 0) + 1;
  const existingDraft = last && !last.isPublished ? { id: last.id, number: last.number } : null;
  return { number, existingDraft };
}

export async function endSeason(id: number) {
  const season = await getSeason(id);
  if (season.endedAt) return season; // idempotent
  return prisma.season.update({ where: { id }, data: { endedAt: new Date(), isArchived: true } });
}

export async function updateSeasonSettings(
  id: number,
  data: {
    repeatPairingWindow?: number;
    countExternalMatches?: boolean;
    regularByeCap?: number;
    knsbTournamentName?: string;
    knsbPlannedEndDate?: Date | null;
  },
) {
  return prisma.season.update({ where: { id }, data });
}

/**
 * The live leaderboard: replayed from this season's *published* rounds only.
 * This is a public, no-auth endpoint, so — unlike the round-pairing views,
 * which already carry full player relations — standings need player
 * name/membershipType enriched in here rather than requiring visitors to
 * hit the admin-only players list to resolve a bare playerId.
 *
 * Pass `afterRound` to get the standings as they stood right after that
 * published round, instead of the season's current state — the engine
 * already computes every round's snapshot in one replay (`byRound`), so this
 * is just picking a different snapshot out of the same result, not a
 * separate/heavier computation.
 */
export async function getLiveLeaderboard(seasonId: number, afterRound?: number) {
  const season = await prisma.season.findUnique({
    where: { id: seasonId },
    include: { enrollments: { include: { player: true } } },
  });
  if (!season) throw new HttpError(404, `Season ${seasonId} not found`);

  const publishedRounds = await prisma.round.findMany({
    where: { seasonId, isPublished: true },
    include: { entries: true },
    orderBy: { number: 'asc' },
  });

  // The countExternalMatches toggle is meant to control whether external
  // results affect scoring at all, not just whether they're visible — drop
  // them here before replay when the season has the setting off, rather than
  // relying on query-level filtering elsewhere (which only hides them).
  const roundsForReplay = season.countExternalMatches
    ? publishedRounds
    : publishedRounds.map((r) => ({ ...r, entries: r.entries.filter((e) => e.kind !== 'EXTERNAL_BYE') }));

  const replay = replaySeason({
    topValue: season.topValue,
    baselines: mapEnrollmentsToBaselines(season.enrollments),
    rounds: roundsForReplay.map(mapRoundToEngine),
  });

  let snapshot = replay.current;
  if (afterRound != null) {
    const found = replay.byRound.find((r) => r.roundNumber === afterRound);
    if (!found) throw new HttpError(404, `Round ${afterRound} has no published standings in this season`);
    snapshot = found;
  }

  const playerById = new Map(season.enrollments.map((e) => [e.playerId, e.player]));
  return {
    ...snapshot,
    availableRounds: publishedRounds.map((r) => r.number),
    standings: snapshot.standings.map((s) => {
      const player = playerById.get(s.playerId);
      return { ...s, name: player?.name ?? `#${s.playerId}`, membershipType: player?.membershipType ?? 'FULL' };
    }),
  };
}

/**
 * Published rounds only, most recent first. REGULAR_BYE entries are excluded
 * here — server-side, not just hidden client-side — because absent players
 * are never named in the round view at all. EXTERNAL_BYE is included: it's a
 * real result (counts toward standings), so it's shown publicly too.
 */
export async function getPublicRounds(seasonId: number) {
  const season = await prisma.season.findUnique({ where: { id: seasonId } });
  const kinds: string[] = ['GAME', 'PAIRING_BYE'];
  if (season?.countExternalMatches) kinds.push('EXTERNAL_BYE');
  return prisma.round.findMany({
    where: { seasonId, isPublished: true },
    include: {
      entries: {
        where: { kind: { in: kinds as ('GAME' | 'PAIRING_BYE' | 'EXTERNAL_BYE')[] } },
        include: { whitePlayer: true, blackPlayer: true, soloPlayer: true },
      },
    },
    orderBy: { number: 'desc' },
  });
}

/**
 * Same published-rounds scope, but every entry kind — the admin preview also
 * needs REGULAR_BYE. EXTERNAL_BYE is excluded when the season has external
 * matches turned off — same "disappears entirely, not just hidden" treatment
 * as REGULAR_BYE gets on the public feed.
 */
export async function getAdminRounds(seasonId: number) {
  const season = await prisma.season.findUnique({ where: { id: seasonId } });
  const kinds: string[] = ['GAME', 'PAIRING_BYE', 'REGULAR_BYE'];
  if (season?.countExternalMatches) kinds.push('EXTERNAL_BYE');
  return prisma.round.findMany({
    where: { seasonId, isPublished: true },
    include: {
      entries: {
        where: { kind: { in: kinds as ('GAME' | 'PAIRING_BYE' | 'REGULAR_BYE' | 'EXTERNAL_BYE')[] } },
        include: { whitePlayer: true, blackPlayer: true, soloPlayer: true },
      },
    },
    orderBy: { number: 'desc' },
  });
}
