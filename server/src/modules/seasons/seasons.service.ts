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
  roster: RosterEntryInput[];
}

export async function createSeason(input: CreateSeasonInput) {
  const active = await prisma.season.findFirst({ where: { endedAt: null } });
  if (active) throw new HttpError(409, 'A season is already active — end it before starting a new one');

  const clubSettings = await prisma.clubSettings.findUniqueOrThrow({ where: { id: 1 } });
  const topValue = input.topValue ?? clubSettings.defaultTopValue;
  const repeatPairingWindow = input.repeatPairingWindow ?? clubSettings.defaultRepeatPairingWindow;
  const countExternalMatches = input.countExternalMatches ?? clubSettings.defaultCountExternalMatches;

  return prisma.$transaction(async (tx) => {
    const season = await tx.season.create({
      data: { name: input.name, topValue, repeatPairingWindow, countExternalMatches },
    });
    for (const entry of input.roster) {
      let playerId = entry.playerId;
      if (playerId == null) {
        if (!entry.newPlayerName) throw new HttpError(400, 'Each roster entry needs a playerId or a newPlayerName');
        const player = await tx.player.create({
          data: { name: entry.newPlayerName, membershipType: entry.membershipType ?? 'FULL' },
        });
        playerId = player.id;
      }
      await tx.seasonEnrollment.create({
        data: { seasonId: season.id, playerId, startingValue: entry.startingValue },
      });
    }
    return season;
  });
}

export async function endSeason(id: number) {
  const season = await getSeason(id);
  if (season.endedAt) return season; // idempotent
  return prisma.season.update({ where: { id }, data: { endedAt: new Date(), isArchived: true } });
}

export async function updateSeasonSettings(
  id: number,
  data: { repeatPairingWindow?: number; countExternalMatches?: boolean },
) {
  return prisma.season.update({ where: { id }, data });
}

/**
 * The live leaderboard: replayed from this season's *published* rounds only.
 * This is a public, no-auth endpoint, so — unlike the round-pairing views,
 * which already carry full player relations — standings need player
 * name/membershipType enriched in here rather than requiring visitors to
 * hit the admin-only players list to resolve a bare playerId.
 */
export async function getLiveLeaderboard(seasonId: number) {
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

  const replay = replaySeason({
    topValue: season.topValue,
    baselines: mapEnrollmentsToBaselines(season.enrollments),
    rounds: publishedRounds.map(mapRoundToEngine),
  });

  const playerById = new Map(season.enrollments.map((e) => [e.playerId, e.player]));
  return {
    ...replay.current,
    standings: replay.current.standings.map((s) => {
      const player = playerById.get(s.playerId);
      return { ...s, name: player?.name ?? `#${s.playerId}`, membershipType: player?.membershipType ?? 'FULL' };
    }),
  };
}

/**
 * Published rounds only, most recent first. REGULAR_BYE entries are excluded
 * here — server-side, not just hidden client-side — because absent players
 * are never named in the round view at all.
 */
export async function getPublicRounds(seasonId: number) {
  return prisma.round.findMany({
    where: { seasonId, isPublished: true },
    include: {
      entries: {
        where: { kind: { in: ['GAME', 'PAIRING_BYE'] } },
        include: { whitePlayer: true, blackPlayer: true, soloPlayer: true },
      },
    },
    orderBy: { number: 'desc' },
  });
}
